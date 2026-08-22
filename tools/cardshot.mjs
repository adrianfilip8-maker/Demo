#!/usr/bin/env node
/**
 * cardshot.mjs — photograph the pause/controls card at the playtest resolution (§549).
 *
 * The card is the only place 18 of the game's 24 documented control rows appear, and a pad player
 * is about to open it. Every §549 measurement of it was taken on `_hudshim`, which has no layout
 * and no paint: it can say an element CHANGED and cannot say the player can READ it. Four columns
 * of 24 rows at 1280x720, with PS4 glyphs that are wider than the keycaps the layout was designed
 * around, has never been rendered to pixels.
 *
 * So this answers exactly one question — does the card fit and is it legible — and answers it in
 * BOTH channels, because either alone is weak:
 *   · NUMBERS: the panel's own scroll/client sizes, its box against the viewport, and every
 *     descendant's right/bottom edge. Overflow is a fact, not an opinion, and a plate can hide it
 *     (a clipped column simply looks like a shorter column).
 *   · PIXELS: the plate itself, because "nothing overflows" is not the same as "a human can read
 *     it at 19 px".
 *
 * Two plates, pad and keyboard, so the comparison exists — the pad column is the one at risk.
 *
 * ── WHAT THIS ESTABLISHED, and what it could not (§549) ─────────────────────────────────────
 *
 * MEASURED, on a card opened by the pad's Options button in a real browser at 1280x720:
 *
 *     open=true  rows=24  padGlyphs=23
 *     panel box  313.6,80.4  652.8 x 559.3      viewport 1280 x 720
 *     panel scroll 678x579 vs client 678x579    no overflow
 *     cols  scroll 647x447 vs client 647x447    no overflow
 *     elements outside the viewport: 0
 *     smallest rendered text 7.5 px
 *
 * So the card FITS, with room, and nothing is clipped. The 7.5 px floor is the card's own — it is
 * the value `hud.test.mjs` M6 measures every other HUD text against — and it is small.
 *
 * NOT OBTAINED: the plate. `page.screenshot()` waits for a compositor frame and this page has no
 * surface to composite to; it hung for the full timeout twice, after logging "fonts loaded". The
 * house capture `__GAME.grab()` cannot substitute, because it reads the WebGL drawing buffer and
 * `HUD.js`'s header states that DOM never lands in it BY DESIGN — that is the screenshot-critic
 * guarantee, and it is exactly what makes a HUD overlay unphotographable this way. CDP's
 * `Page.captureScreenshot` with `fromSurface:false` is the remaining avenue and did not complete
 * here under load. **The overflow question is answered by the numbers; legibility is not, and is
 * eyes-only until someone renders this where a compositor exists.**
 *
 * ── TWO TRAPS THIS TOOL WALKED INTO, so the next reader does not ────────────────────────────
 *
 * 1. **The loop does not run frames here.** Left to rAF, `navigator.getGamepads` was called FOUR
 *    times in 20 s: `main.js:281` starts the loop unconditionally, but rAF is throttled to nothing
 *    for a page no compositor is showing. `Input.beginFrame` therefore never ran, no pad poll ever
 *    happened, and a 90 s Options hold could not land. Frames must be STEPPED (`__GAME.step()`),
 *    which is what every capture tool here already does.
 * 2. **Measure only after the thing under test has happened.** The first run reported a tidy
 *    "VERDICT: fits" for a card that had never opened — `open=false`, `padGlyphs=0`. The panel is
 *    laid out while hidden, so the numbers looked entirely plausible. `open` and `padGlyphs` are
 *    printed first for that reason, and a warning is emitted when the card is shut.
 *
 * Escape kept working throughout both failures, which is what made the split obvious: it is a DOM
 * keydown listener, while P and Options must be read inside a frame.
 *
 * Usage:  node tools/cardshot.mjs
 * Output: progress/records/ui/card-pad.png, card-key.png, and a metrics table on stdout.
 */
import { chromium } from 'playwright';
import { acquire } from './lock.mjs';
import { spawn, execFileSync } from 'node:child_process';
import { existsSync, mkdirSync } from 'node:fs';
import net from 'node:net';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const OUT = path.join(ROOT, 'progress/records/ui');
const W = 1280, H = 720;

async function freePort(start = 5700) {
  for (let p = start; p < start + 200; p++) {
    const ok = await new Promise((res) => {
      const s = net.createServer();
      s.once('error', () => res(false));
      s.once('listening', () => s.close(() => res(true)));
      s.listen(p, '127.0.0.1');
    });
    if (ok) return p;
  }
  throw new Error('no free port');
}
async function startServer(port) {
  const proc = spawn(`${ROOT}/node_modules/.bin/vite`,
    ['--port', String(port), '--strictPort', '--host', '127.0.0.1'],
    { cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, NO_COLOR: '1', SANDS_NO_HMR: '1' } });
  let log = '';
  proc.stdout.on('data', (d) => { log += d; });
  proc.stderr.on('data', (d) => { log += d; });
  for (let i = 0; i < 240; i++) {
    const up = await new Promise((res) => {
      const s = net.connect(port, '127.0.0.1');
      s.once('connect', () => { res(true); s.destroy(); });
      s.once('error', () => res(false));
      s.setTimeout(2000, () => { res(false); s.destroy(); });
    });
    if (up) return proc;
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error(`vite never listened:\n${log}`);
}

mkdirSync(OUT, { recursive: true });
const sha = execFileSync('git', ['rev-parse', '--short', 'HEAD'], { cwd: ROOT, encoding: 'utf8' }).trim();
const release = await acquire({ onWait: (s) => console.log(`[card] waiting for the capture lock · ${s}`) });
console.log(`[card] lock · sha ${sha} · viewport ${W}x${H}`);
const port = await freePort();
const server = await startServer(port);
const CHROME = process.env.CHROME_PATH
  || ['/opt/pw-browsers/chromium', '/usr/bin/chromium'].find((p) => existsSync(p));
const browser = await chromium.launch({
  executablePath: CHROME,
  args: ['--no-sandbox', '--disable-dev-shm-usage', '--use-gl=angle', '--use-angle=swiftshader',
    '--enable-unsafe-swiftshader', '--enable-webgl', '--ignore-gpu-blocklist',
    '--js-flags=--max-old-space-size=4096', '--mute-audio'],
    /* NOT added: --disable-renderer-backgrounding and friends. Tried, and they made it worse —
       the run wedged inside the first `__GAME.step()` having burned 1 s of CPU in 20 minutes.
       Frames are stepped by hand here anyway, so nothing needs rAF to be un-throttled. */
});
const ctx = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
const page = await ctx.newPage();
page.on('pageerror', (e) => console.log(`[card] pageerror: ${e.message}`));

/* `page.screenshot()` waits for a compositor frame and this page has no surface to composite to —
   it hung for the full 180 s twice, after reporting "fonts loaded". CDP's captureScreenshot with
   `fromSurface: false` renders straight out of the renderer process instead, which is the standard
   answer for a headless page nothing is displaying. The HUD is DOM, so `__GAME.grab()` — the
   house capture — cannot be used here: it reads the WebGL drawing buffer, and HUD.js's header
   states that DOM never lands in it by design. */
const cdp = await ctx.newCDPSession(page);
const { writeFileSync } = await import('node:fs');
const plate = async (file) => {
  const { data } = await cdp.send('Page.captureScreenshot', {
    format: 'png', fromSurface: false, captureBeyondViewport: false,
  });
  writeFileSync(file, Buffer.from(data, 'base64'));
};

/* The pad mock rides in before any game script, same shape padprobe.mjs uses. */
await page.addInitScript(() => {
  const state = {
    connected: false,
    buttons: Array.from({ length: 17 }, () => ({ pressed: false, value: 0 })),
    axes: [0, 0, 0, 0],
  };
  window.__PAD = {
    connect(c = true) { state.connected = c; },
    press(i, v = 1) { state.buttons[i] = { pressed: v > 0, value: v }; },
    lift(i) { state.buttons[i] = { pressed: false, value: 0 }; },
  };
  const snap = () => ({
    id: 'Wireless Controller (STANDARD GAMEPAD Vendor: 054c Product: 09cc)',
    index: 0, connected: state.connected, mapping: 'standard', timestamp: performance.now(),
    buttons: state.buttons.map((b) => ({ pressed: b.pressed, value: b.value })),
    axes: [...state.axes],
  });
  Object.defineProperty(navigator, 'getGamepads', {
    configurable: true,
    value: () => (state.connected ? [snap(), null, null, null] : [null, null, null, null]),
  });
});

/** Everything measurable about the open card, read from the live layout. */
const MEASURE = () => {
  const root = document.getElementById('sly-hud');
  const card = root?.querySelector('.sly-pause');
  const panel = card?.querySelector('.sly-pause-panel');
  const cols = card?.querySelector('.sly-cols');
  if (!card || !panel) return { error: 'no card in the DOM' };
  const vw = window.innerWidth, vh = window.innerHeight;
  const pb = panel.getBoundingClientRect();

  /* Every descendant that pokes outside the viewport, or outside its own scroll parent. */
  const spills = [];
  for (const el of card.querySelectorAll('*')) {
    const r = el.getBoundingClientRect();
    if (r.width === 0 && r.height === 0) continue;
    if (r.right > vw + 0.5 || r.bottom > vh + 0.5 || r.left < -0.5 || r.top < -0.5) {
      spills.push({
        cls: el.className?.baseVal ?? String(el.className || el.tagName),
        l: +r.left.toFixed(1), t: +r.top.toFixed(1), r: +r.right.toFixed(1), b: +r.bottom.toFixed(1),
      });
    }
  }
  /* Smallest rendered text in the card — the legibility floor a plate cannot state. */
  let minPx = Infinity, minCls = '';
  for (const el of card.querySelectorAll('*')) {
    if (!el.textContent?.trim()) continue;
    if (el.children.length) continue;                 // leaves only, so we size real text
    const fs = parseFloat(getComputedStyle(el).fontSize);
    if (fs && fs < minPx) { minPx = fs; minCls = String(el.className || el.tagName); }
  }
  return {
    open: card.classList.contains('on'),
    viewport: [vw, vh],
    panel: {
      box: [+pb.left.toFixed(1), +pb.top.toFixed(1), +pb.width.toFixed(1), +pb.height.toFixed(1)],
      scrollH: panel.scrollHeight, clientH: panel.clientHeight,
      scrollW: panel.scrollWidth, clientW: panel.clientWidth,
    },
    cols: cols ? { scrollH: cols.scrollHeight, clientH: cols.clientHeight,
      scrollW: cols.scrollWidth, clientW: cols.clientWidth } : null,
    rows: card.querySelectorAll('.sly-row').length,
    padGlyphs: (cols?.innerHTML.match(/assets\/prompts\//g) || []).length,
    minFontPx: minPx === Infinity ? null : +minPx.toFixed(1),
    minFontOn: minCls,
    spills,
  };
};

const report = (tag, m) => {
  if (m.error) { console.log(`[card] ${tag}: ${m.error}`); return true; }
  const panelOverflowY = m.panel.scrollH > m.panel.clientH + 1;
  const panelOverflowX = m.panel.scrollW > m.panel.clientW + 1;
  const colsOverflowY = m.cols && m.cols.scrollH > m.cols.clientH + 1;
  const colsOverflowX = m.cols && m.cols.scrollW > m.cols.clientW + 1;
  const tallerThanView = m.panel.box[3] > m.viewport[1] + 0.5;
  console.log(`\n[card] ${tag}`);
  console.log(`  open=${m.open}  rows=${m.rows}  padGlyphs=${m.padGlyphs}`);
  console.log(`  panel box  x${m.panel.box[0]} y${m.panel.box[1]}  ${m.panel.box[2]}x${m.panel.box[3]}  (viewport ${m.viewport[0]}x${m.viewport[1]})`);
  console.log(`  panel scroll ${m.panel.scrollW}x${m.panel.scrollH} vs client ${m.panel.clientW}x${m.panel.clientH}`
    + `   overflow: ${panelOverflowX ? 'X ' : ''}${panelOverflowY ? 'Y' : ''}${!panelOverflowX && !panelOverflowY ? 'none' : ''}`);
  if (m.cols) console.log(`  cols  scroll ${m.cols.scrollW}x${m.cols.scrollH} vs client ${m.cols.clientW}x${m.cols.clientH}`
    + `   overflow: ${colsOverflowX ? 'X ' : ''}${colsOverflowY ? 'Y' : ''}${!colsOverflowX && !colsOverflowY ? 'none' : ''}`);
  console.log(`  smallest rendered text ${m.minFontPx} px  on "${m.minFontOn}"`);
  console.log(`  elements outside the viewport: ${m.spills.length}`);
  for (const s of m.spills.slice(0, 8)) console.log(`     ${s.cls}  l${s.l} t${s.t} r${s.r} b${s.b}`);
  if (m.spills.length > 8) console.log(`     … and ${m.spills.length - 8} more`);
  const bad = panelOverflowX || panelOverflowY || colsOverflowX || colsOverflowY || tallerThanView || m.spills.length > 0;
  console.log(`  VERDICT: ${bad ? 'DOES NOT FIT' : 'fits'}`);
  return bad;
};

let broken = false;
try {
  await page.goto(`http://127.0.0.1:${port}/?shot=1&q=high`, { waitUntil: 'domcontentloaded', timeout: 120000 });
  await page.waitForFunction('window.__GAME && window.__GAME.ready === true', null, { timeout: 600000, polling: 500 });
  console.log('[card] ready');

  /* Frames are STEPPED, not waited for.
     Measured, not assumed: with the rAF loop left to itself in this headless container,
     `navigator.getGamepads` was called **4 times total** across 20 s of wall clock — the loop is
     started (`main.js:281`, unconditionally) but rAF is throttled to nothing for a page no
     compositor is showing. So `Input.beginFrame` never ran, no pad poll ever happened, and the
     first version of this tool sat on a 90 s Options hold that could not possibly land. The card
     was fine; the world I was measuring in had no frames in it (§442).

     `__GAME.step()` calls `engine.renderFrame` directly and yields so SwiftShader flushes — the
     same lever every capture tool here uses. Escape kept working throughout, which is what made
     the split obvious: it is a DOM keydown listener, while P and Options need a frame to be read
     in. */
  const step = (n = 6) => page.evaluate((k) => window.__GAME.step(k, 1 / 60), n);

  await step(10);

  /* ---------------- PAD: open it the way a pad player will, with Options ---------------- */
  await page.evaluate(() => window.__PAD.connect(true));
  await step(6);                                        // resting polls first (§542 trust)
  await page.evaluate(() => window.__PAD.press(9));     // Options
  await step(6);
  await page.evaluate(() => window.__PAD.lift(9));
  await step(6);

  const padM = await page.evaluate(MEASURE);
  if (!padM.open) console.log('[card] WARNING — the card did not open on the pad; numbers below describe a CLOSED card');
  broken = report('PAD (opened with Options)', padM) || broken;
  await plate(path.join(OUT, 'card-pad.png'));
  console.log('  plate -> progress/records/ui/card-pad.png');

  /* ---------------- KEYBOARD: same card, keycap columns ---------------- */
  await page.keyboard.press('Escape');
  await step(6);
  await page.keyboard.press('KeyE');                    // a real key claims the device back
  await step(6);
  await page.keyboard.press('Escape');
  await step(6);

  const keyM = await page.evaluate(MEASURE);
  if (!keyM.open) console.log('[card] WARNING — the card did not open on the keyboard either');
  broken = report('KEYBOARD (opened with Escape)', keyM) || broken;
  await plate(path.join(OUT, 'card-key.png'));
  console.log('  plate -> progress/records/ui/card-key.png');

  console.log(`\n[card] ${broken ? 'OVERFLOW FOUND — see the plates' : 'both cards fit the viewport with no spill'}`);
  if (broken) process.exitCode = 1;
} catch (err) {
  console.log(`[card] FAIL — ${err?.message || err}`);
  process.exitCode = 1;
} finally {
  await browser.close().catch(() => {});
  server.kill('SIGTERM');
  try { release?.(); } catch {}
}

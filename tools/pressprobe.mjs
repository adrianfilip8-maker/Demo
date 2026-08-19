#!/usr/bin/env node
/**
 * pressprobe.mjs — does a REAL mouse click or key press ever reach an exact-frame `pressed()`
 * read in the live game?
 *
 * Exists because slamtrace proved the committed "Cane Slam" captures were plain falls: the
 * apparatus's `page.mouse.down()` never became the `attack` action. Two candidate mechanisms,
 * both in `Input.js`, and they have different blast radii:
 *
 *   1. THE LOCK SWALLOW. The first unlocked left click is consumed as the pointer-lock
 *      acquisition click (`_onMouseDown`: `if (!this.locked && e.button === 0 &&
 *      this.requestLock())`). Headless Chromium never grants the lock, so `locked` stays false
 *      and EVERY click is swallowed. Harness-only if lock is granted on real hardware.
 *   2. THE FRAME STAMP. `_press` stamps `_pressedFrame` with `this._frame`; `beginFrame()`
 *      increments `_frame` BEFORE the module loop reads `pressed()` (main.js wrapper order).
 *      A DOM event can only ever dispatch BETWEEN frames, so its stamp is one behind every
 *      read that will ever happen — `pressed('attack')` from a real click would then be false
 *      FOREVER, live loop or sim loop, on real hardware too. Pad presses are immune
 *      (`_padButtons` runs inside `beginFrame`, after the increment) and `buffered('jump')` is
 *      immune (game-clock window), which is exactly the §439 shape: every driver this project
 *      has used stamps like the pad, not like the DOM.
 *
 * Three arms, each recording BOTH the raw event arrival (`_press` called at all — separates the
 * swallow from the stamp) and whether any module-loop read ever saw `pressed() === true`:
 *
 *   A  live rAF loop, `input.locked` forced true, real page.mouse click     → combo should start
 *   B  live rAF loop, locked forced true, real KeyE tap near nothing        → edge visibility only
 *   C  stopped loop + __simStep (the camlook pump), real mouse click        → the apparatus case
 *
 * No screenshots; takes the capture lock only to serialise vite/browser use with camlook.
 */
import { chromium } from 'playwright';
import { acquire } from './lock.mjs';
import { spawn, execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import net from 'node:net';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const Q = process.env.Q || 'high';

async function freePort(start = 5600) {
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

const sha = execFileSync('git', ['rev-parse', '--short', 'HEAD'], { cwd: ROOT, encoding: 'utf8' }).trim();
const release = await acquire('look2-camlane');
console.log(`[press] lock · sha ${sha}`);
const port = await freePort();
const server = await startServer(port);
const CHROME = process.env.CHROME_PATH
  || ['/opt/pw-browsers/chromium', '/usr/bin/chromium'].find((p) => existsSync(p));
const browser = await chromium.launch({
  executablePath: CHROME,
  args: ['--no-sandbox', '--disable-dev-shm-usage', '--use-gl=angle', '--use-angle=swiftshader',
    '--enable-unsafe-swiftshader', '--enable-webgl', '--ignore-gpu-blocklist',
    '--disable-frame-rate-limit', '--js-flags=--max-old-space-size=4096', '--mute-audio'],
});
const ctx = await browser.newContext({ viewport: { width: 640, height: 360 }, deviceScaleFactor: 1 });
const page = await ctx.newPage();
page.on('pageerror', (e) => console.log(`[press] pageerror: ${e.message}`));

try {
  await page.goto(`http://127.0.0.1:${port}/?shot=1&q=${Q}`, { waitUntil: 'domcontentloaded', timeout: 120000 });
  await page.waitForFunction('window.__GAME && window.__GAME.ready === true', null, { timeout: 600000, polling: 500 });
  console.log('[press] ready');

  await page.evaluate(() => {
    const e = window.__ENGINE, ip = e.input;
    window.__GAME.hideHud(true);
    e.debug.freeCam = false;
    ip.locked = true;                        // arm 1 out of the way: no click is a lock click now
    window.__raw = { press: [], seen: 0, reads: 0 };
    const origPress = ip._press.bind(ip);
    ip._press = (a, src) => { window.__raw.press.push([a, src, ip._frame]); return origPress(a, src); };
    const origPressed = ip.pressed.bind(ip);
    ip.pressed = (a) => {
      const r = origPressed(a);
      window.__raw.reads++;
      if ((a === 'attack' || a === 'interact') && r) window.__raw.seen++;
      return r;
    };
    // the camlook sim pump, for arm C
    window.__simStep = (n, dt) => {
      for (let i = 0; i < n; i++) {
        e.input?.beginFrame?.();
        e.dt = Math.min(dt, 1 / 20) * e.timeScale;
        e.time += e.dt; e.frame++;
        for (const { key, mod } of e._ordered) {
          if (typeof mod.update === 'function') { try { mod.update(e.dt, e.time); } catch {} }
        }
      }
    };
  });
  const raw = () => page.evaluate(() => ({ ...window.__raw, press: window.__raw.press.slice(-6),
    frame: window.__ENGINE.input._frame, st: window.__ENGINE.get('movement')?.stateName }));
  const zero = () => page.evaluate(() => { window.__raw.press.length = 0; window.__raw.seen = 0; window.__raw.reads = 0; });

  /* ---- A: live loop, real mouse click, grounded (combo is the exact-frame consumer) ---- */
  await page.waitForTimeout(600);
  await zero();
  await page.mouse.move(320, 180);
  await page.mouse.down({ button: 'left' });
  await page.waitForTimeout(120);
  await page.mouse.up({ button: 'left' });
  await page.waitForTimeout(400);
  const A = await raw();
  console.log(`[A live+mouse] press events ${JSON.stringify(A.press)} · pressed() true seen ${A.seen}`
    + ` of ${A.reads} reads · state ${A.st}`);

  /* ---- B: live loop, real KeyE tap ---- */
  await zero();
  await page.keyboard.down('KeyE');
  await page.waitForTimeout(80);
  await page.keyboard.up('KeyE');
  await page.waitForTimeout(400);
  const B = await raw();
  console.log(`[B live+KeyE ] press events ${JSON.stringify(B.press)} · pressed() true seen ${B.seen}`
    + ` of ${B.reads} reads · state ${B.st}`);

  /* ---- C: stopped loop + sim pump (the camlook case), real mouse click ---- */
  await page.evaluate(() => window.__ENGINE.stopLoop());
  await zero();
  await page.mouse.down({ button: 'left' });
  await page.evaluate(() => window.__simStep(2, 1 / 60));
  await page.mouse.up({ button: 'left' });
  await page.evaluate(() => window.__simStep(6, 1 / 60));
  const C = await raw();
  console.log(`[C sim +mouse] press events ${JSON.stringify(C.press)} · pressed() true seen ${C.seen}`
    + ` of ${C.reads} reads · state ${C.st}`);

  /* ---- D: control — a press synthesised INSIDE the frame, after beginFrame (pad-style) ---- */
  await zero();
  await page.evaluate(() => {
    const e = window.__ENGINE, ip = e.input;
    ip.beginFrame();
    ip._press('attack', 'mouse');
    e.dt = 1 / 60; e.time += e.dt; e.frame++;
    for (const { key, mod } of e._ordered) {
      if (typeof mod.update === 'function') { try { mod.update(e.dt, e.time); } catch {} }
    }
    ip._release('attack', 'mouse');
  });
  await page.evaluate(() => window.__simStep(6, 1 / 60));
  const D = await raw();
  console.log(`[D sim +inner] press events ${JSON.stringify(D.press)} · pressed() true seen ${D.seen}`
    + ` of ${D.reads} reads · state ${D.st}`);
} finally {
  await browser.close();
  server.kill('SIGTERM');
  release();
  console.log('[press] released');
}

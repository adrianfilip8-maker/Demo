#!/usr/bin/env node
/**
 * lockprobe.mjs — what happens to real clicks when pointer lock CANNOT engage?
 *
 * §468 fixed the frame stamp and verified it with `input.locked` forced true. The user then
 * played on real hardware and reported "attacks are not working" and "no way to get free of the
 * rings". This probe measures the case §468.4 documented and scoped as "harnesses only": the
 * lock swallow. `_onMouseDown` swallows any unlocked left click for which `requestLock()` was
 * issued — and `requestLock()` returns true for ISSUING the request, not for it being granted.
 * On a machine where the grant fails (denied permission, iframe policy, or Chrome's ~1.25 s
 * re-lock cooldown after every Esc), the swallow repeats for EVERY click, forever.
 *
 * Headless Chromium never grants pointer lock, which makes it a faithful analog of exactly that
 * machine. Arms:
 *
 *   L0  control: locked forced true, real click            -> press must be seen (§468 re-verify)
 *   L1  locked false, lock never grants, 5 real clicks     -> the user's machine
 *   L2  keyboard KeyE under the live UNCAPPED rAF loop     -> rate-dependence check: the pump is
 *       (--disable-frame-rate-limit; SwiftShader runs rAF     1:1 by construction (main.js wraps
 *       far above 60 Hz)                                      one beginFrame per rAF), so the
 *                                                             RAF:logic ratio cannot exceed 1:1;
 *                                                             what CAN vary is absolute rate.
 */
import { chromium } from 'playwright';
import { acquire } from './lock.mjs';
import { spawn, execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import net from 'node:net';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');

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

const sha = execFileSync('git', ['rev-parse', '--short', 'HEAD'], { cwd: ROOT, encoding: 'utf8' }).trim();
const release = await acquire('look2-camlane');
console.log(`[lockprobe] lock · sha ${sha}`);
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
page.on('pageerror', (e) => console.log(`[lockprobe] pageerror: ${e.message}`));

try {
  await page.goto(`http://127.0.0.1:${port}/?shot=1&q=high`, { waitUntil: 'domcontentloaded', timeout: 120000 });
  await page.waitForFunction('window.__GAME && window.__GAME.ready === true', null, { timeout: 600000, polling: 500 });
  console.log('[lockprobe] ready');

  await page.evaluate(() => {
    const e = window.__ENGINE, ip = e.input;
    window.__GAME.hideHud(true);
    e.debug.freeCam = false;
    window.__raw = { press: [], swallowed: 0, lockReqs: 0, seen: 0, reads: 0, frames0: ip._frame };
    const origPress = ip._press.bind(ip);
    ip._press = (a, src) => { window.__raw.press.push([a, src]); return origPress(a, src); };
    const origReq = ip.requestLock.bind(ip);
    ip.requestLock = () => { window.__raw.lockReqs++; return origReq(); };
    // count swallows: a mousedown that produced neither a press nor an unlock-exempt path
    const canvas = ip.canvas;
    canvas.addEventListener('mousedown', (ev) => {
      if (!ip.locked && ev.button === 0) window.__raw.swallowed++;
    }, true);
    const origPressed = ip.pressed.bind(ip);
    ip.pressed = (a) => {
      const r = origPressed(a);
      window.__raw.reads++;
      if ((a === 'attack' || a === 'interact') && r) window.__raw.seen++;
      return r;
    };
  });
  const raw = () => page.evaluate(() => ({ press: window.__raw.press.slice(), swallowed: window.__raw.swallowed,
    lockReqs: window.__raw.lockReqs, seen: window.__raw.seen, reads: window.__raw.reads,
    frames: window.__ENGINE.input._frame - window.__raw.frames0,
    locked: window.__ENGINE.input.locked, st: window.__ENGINE.get('movement')?.stateName }));
  const zero = () => page.evaluate(() => { const r = window.__raw; r.press.length = 0; r.swallowed = 0;
    r.lockReqs = 0; r.seen = 0; r.reads = 0; r.frames0 = window.__ENGINE.input._frame; });

  /* ---- L0 control: locked forced true ---- */
  await page.evaluate(() => { window.__ENGINE.input.locked = true; });
  await page.waitForTimeout(400);
  await zero();
  await page.mouse.move(320, 180);
  await page.mouse.down({ button: 'left' }); await page.waitForTimeout(90); await page.mouse.up({ button: 'left' });
  await page.waitForTimeout(350);
  let r = await raw();
  console.log(`[L0 locked   ] press ${JSON.stringify(r.press)} · seen ${r.seen} · swallowed ${r.swallowed} · state ${r.st}`);

  /* ---- L1 the user's machine: lock cannot engage ---- */
  await page.evaluate(() => { window.__ENGINE.input.locked = false; });
  await page.waitForTimeout(200);
  await zero();
  for (let i = 0; i < 5; i++) {
    await page.mouse.down({ button: 'left' }); await page.waitForTimeout(70); await page.mouse.up({ button: 'left' });
    await page.waitForTimeout(180);
  }
  r = await raw();
  console.log(`[L1 unlocked ] 5 real clicks -> press events ${r.press.length} ${JSON.stringify(r.press)}`
    + ` · swallowed ${r.swallowed} · lock requests ${r.lockReqs} · locked ${r.locked} · seen ${r.seen}`);

  /* ---- L2 keyboard, STAMP-level visibility (§439: the mechanism, not the consumers) ----
     Every pressed('interact') reader in the moveset sits behind an afford() guard, so at spawn
     the edge can be alive on its frame with zero module reads. Instrument beginFrame to record,
     for each frame, whether the stamp names it — that is what visibility IS. */
  await page.evaluate(() => {
    const ip = window.__ENGINE.input;
    window.__stamp = [];
    const origBegin = ip.beginFrame.bind(ip);
    ip.beginFrame = (dt) => {
      const r2 = origBegin(dt);
      const st = ip._pressedFrame.get('interact');
      if (st != null && Math.abs(st - ip._frame) < 4) window.__stamp.push([ip._frame, st, st === ip._frame]);
      return r2;
    };
  });
  for (let tap = 0; tap < 3; tap++) {
    await page.keyboard.down('KeyE'); await page.waitForTimeout(60); await page.keyboard.up('KeyE');
    await page.waitForTimeout(320);
  }
  const st = await page.evaluate(() => window.__stamp);
  const hits = st.filter((x) => x[2]).length;
  console.log(`[L2 KeyE stamp] 3 taps -> frames where stamp===frame: ${hits} · window rows ${JSON.stringify(st.slice(0, 8))}`);
} finally {
  await browser.close();
  server.kill('SIGTERM');
  release();
  console.log('[lockprobe] released');
}

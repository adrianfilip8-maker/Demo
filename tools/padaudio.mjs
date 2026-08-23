/**
 * padaudio.mjs — the audio chain from a press to a running voice, on the PLAYER's path.
 *
 * Why this exists (§661). Every audio check this project has is one of two shapes, and neither
 * one boots the page a player boots:
 *   · `tests/audio*.test.mjs` render through an `OfflineAudioContext` — which has no
 *     `state`, no autoplay policy, and no `resume()` to refuse;
 *   · `tools/harness.mjs` navigates with `?shot=1`, and `src/main.js:292` branches on that
 *     param: the veil is dismissed with NO gesture listener armed, `_prefetchStem` returns
 *     early on the same param, and `begin()` — the only caller of `input.requestLock()` and
 *     `audio.unlock()` in the shipped page — is never registered.
 *
 * So the shipped click handler has never been executed by any instrument in this project.
 * This boots WITHOUT `?shot` and reports every link in the chain by observation.
 *
 * Usage: node tools/padaudio.mjs [--pad] [--verbose]
 *   --pad   install a synthetic DS4 before any module loads and press Cross instead of clicking.
 */
import { chromium } from 'playwright';
import { acquire } from './lock.mjs';
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import net from 'node:net';

const ROOT = path.resolve(import.meta.dirname, '..');
const CHROME_CANDIDATES = ['/opt/pw-browsers/chromium', '/usr/bin/chromium', '/usr/bin/chromium-browser'];
const BASE_ARGS = [
  '--no-sandbox', '--disable-dev-shm-usage', '--use-gl=angle', '--use-angle=swiftshader',
  '--enable-unsafe-swiftshader', '--enable-webgl', '--ignore-gpu-blocklist',
  '--js-flags=--max-old-space-size=4096', '--force-device-scale-factor=1', '--hide-scrollbars',
];
/* NOTE: `--mute-audio` is deliberately NOT here. `tools/harness.mjs` passes it on every capture,
   and while it does not change `AudioContext.state`, an instrument for "is sound coming out"
   must not carry a flag whose name is "no sound comes out". */

async function freePort(start = 5600) {
  for (let p = start; p < start + 300; p++) {
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
  const bin = path.join(ROOT, 'node_modules', '.bin', 'vite');
  const proc = spawn(bin, ['--port', String(port), '--strictPort', '--host', '127.0.0.1'], {
    cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, NO_COLOR: '1', SANDS_NO_HMR: '1' },
  });
  let log = '';
  proc.stdout.on('data', (d) => { log += d; });
  proc.stderr.on('data', (d) => { log += d; });
  for (let i = 0; i < 160; i++) {
    if (proc.exitCode !== null) throw new Error(`vite exited (${proc.exitCode}):\n${log}`);
    const up = await new Promise((res) => {
      const s = net.connect(port, '127.0.0.1');
      s.once('connect', () => { res(true); s.destroy(); });
      s.once('error', () => res(false));
      s.setTimeout(2000, () => { res(false); s.destroy(); });
    });
    if (up) return proc;
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error(`vite never listened on ${port}`);
}

/* Injected before ANY module loads: a DS4 exactly as Chrome's standard mapping reports one, plus
   a `__press(i)` the driver can pulse. This replaces the DEVICE, not the code that reads it —
   everything downstream of `navigator.getGamepads` is the shipped `src/core/Input.js`. */
const PAD_INIT = `
(() => {
  const pad = {
    id: 'Wireless Controller (STANDARD GAMEPAD Vendor: 054c Product: 09cc)',
    index: 0, connected: true, mapping: 'standard', timestamp: 0,
    buttons: Array.from({ length: 17 }, () => ({ pressed: false, value: 0, touched: false })),
    axes: [0, 0, 0, 0],
  };
  window.__PAD = pad;
  window.__press = (i, on) => { pad.buttons[i] = { pressed: !!on, value: on ? 1 : 0, touched: !!on }; pad.timestamp = performance.now(); };
  navigator.getGamepads = () => [pad, null, null, null];
})();
`;

/**
 * ── THE CALIBRATION ARM, and why this probe is worthless without it (§663) ────────────────────
 *
 * The first version of this file reported, confidently, that a pad press never claims the device:
 * `_padIndex` 0, `padSeen` true, `lastDevice` still `'kbm'`, no AudioContext. Every field was
 * real. The reading was worthless, because **the rAF loop was not running**: headless Chromium
 * produces no BeginFrames for a page nothing is driving, `Engine._tick` never fired,
 * `Input.beginFrame` never polled, and a pad that is never polled looks exactly like a pad that
 * is polled and ignored. The two are numerically identical and only a SECOND quantity separates
 * them — frames advanced.
 *
 * A real click woke the scheduler, which is why the mouse arm passed and the pad arm did not, and
 * why the difference looked like a device bug rather than an instrument bug.
 *
 * So: frames are pumped with mouse MOVES, which drive the compositor and are explicitly NOT
 * activation-triggering input events (a `mousemove` grants no user activation, so the pad-only
 * claim stays honest), and `engine.frame` is read before and after every stage. If it has not
 * advanced, this aborts instead of reporting.
 */
const FRAMES = `(window.__ENGINE && window.__ENGINE.frame) || 0`;

/* Everything observable about the chain, read from the SHIPPED objects. */
const PROBE = `
(() => {
  const e = window.__ENGINE;
  const a = e && e.get && e.get('audio');
  const i = e && e.input;
  const boot = document.getElementById('boot');
  if (!a) return { err: 'no audio module' };
  let masterGain = null, musicGain = null;
  try { masterGain = a.masterGain ? a.masterGain.gain.value : null; } catch {}
  try { musicGain = a.musicBus ? a.musicBus.gain.value : null; } catch {}
  return {
    // --- has the page reached the player at all ---
    bootGone: !!(boot && boot.classList.contains('gone')),
    bootPresent: !!boot,
    // --- input ---
    lastDevice: i ? i.lastDevice : null,
    padIndex: i ? i._padIndex : null,
    padSeen: !!(navigator.getGamepads && [...navigator.getGamepads()].some(g => g && g.connected)),
    // --- audio, the three distinct states ---
    available: a.available,
    hasCtx: !!a.ctx,
    ctxState: a.ctx ? a.ctx.state : null,
    ready: a.ready,
    audible: a.audible,
    currentTime: a.ctx ? +a.ctx.currentTime.toFixed(3) : null,
    sampleRate: a.ctx ? a.ctx.sampleRate : null,
    // --- is the gesture listener still armed (the §552 retry path) ---
    gestureArmed: !!a._gestureGo,
    // --- the music track specifically ---
    trackState: a._trackState,
    trackKicked: !!a._trackKicked,
    prefetched: !!a._prefetched,
    bytesHeld: a._bytes ? a._bytes.size : null,
    stems: a._stems ? [...a._stems.keys()] : null,
    activeStem: a._activeStem,
    offline: !!a._offline,
    section: a._section,
    masterGain, musicGain, muted: a.muted,
    // --- the second quantity: is the loop that polls the pad actually turning ---
    engineFrame: e.frame, looping: e._looping, enginePaused: !!e.paused,
    visibility: document.visibilityState, hasFocus: document.hasFocus(),
  };
})()
`;

const wantPad = process.argv.includes('--pad');
const verbose = process.argv.includes('--verbose');

const release = await acquire({ onWait: (ms) => process.stdout.write(`· waiting for capture lock (${(ms / 1000) | 0}s)\n`) });
const port = await freePort();
const server = await startServer(port);
const executablePath = process.env.CHROME_PATH || CHROME_CANDIDATES.find((p) => existsSync(p));
const browser = await chromium.launch({ executablePath, args: BASE_ARGS });
const log = [];

try {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const page = await ctx.newPage();
  page.on('console', (m) => { if (verbose || m.type() === 'error') log.push(`[page:${m.type()}] ${m.text()}`); });
  page.on('pageerror', (e) => log.push(`[pageerror] ${e.message}`));
  const requests = [];
  page.on('response', (r) => { if (/audio/.test(r.url())) requests.push(`${r.status()} ${r.url().split('/').pop()}`); });

  if (wantPad) await page.addInitScript(PAD_INIT);

  /* THE POINT: no `?shot`. This is the URL a player opens. */
  await page.goto(`http://127.0.0.1:${port}/`, { waitUntil: 'domcontentloaded', timeout: 90000 });
  await page.waitForFunction('window.__GAME && window.__GAME.ready === true', null, { timeout: 300000, polling: 500 });

  /**
   * Wait `ms`, keeping the compositor fed with mouse MOVES so rAF keeps producing frames, and
   * report how many engine frames actually elapsed. Moves are deliberate: they drive BeginFrames
   * and grant NO user activation, so the pad-only arm is not quietly handed a gesture.
   */
  let mx = 3;
  const pump = async (ms) => {
    const t0 = Date.now();
    const f0 = await page.evaluate(FRAMES);
    while (Date.now() - t0 < ms) {
      mx = mx === 3 ? 5 : 3;
      await page.mouse.move(640 + mx, 360 + mx);
      /**
       * MEASURED, and the reason this line exists: in this container's headless Chromium
       * (SwiftShader, no compositor) a page that has never been clicked receives essentially no
       * BeginFrames — `engine.frame` reached 4 during a whole boot and advanced by 0 over 1.2 s of
       * mouse moves, with `_looping` true, `visibilityState` 'visible' and `hasFocus()` true. rAF
       * simply does not tick. `tools/harness.mjs` never noticed because it drives `renderFrame`
       * by hand and boots with `?shot=1`.
       *
       * So frames are stepped explicitly, exactly as that harness does. What this costs is any
       * claim about rAF SCHEDULING, which is not the question. What it preserves is the whole of
       * the question: `renderFrame` -> `input.beginFrame()` -> the pad poll -> `audio.unlock()`,
       * called from a polled frame and NOT from inside a DOM gesture handler — which is precisely
       * the situation a pad-only player is in, and the one the autoplay policy judges.
       */
      await page.evaluate(() => { try { window.__ENGINE.renderFrame(1 / 60); } catch {} });
      await page.waitForTimeout(8);
    }
    return (await page.evaluate(FRAMES)) - f0;
  };

  const stage = async (label) => {
    const r = await page.evaluate(PROBE);
    console.log(`\n── ${label} ─────────────────────────────────`);
    for (const [k, v] of Object.entries(r)) console.log(`   ${k.padEnd(14)} ${JSON.stringify(v)}`);
    return r;
  };

  /* CALIBRATION: if the loop is not turning, nothing below means anything. */
  const warm = await pump(1200);
  console.log(`\n[calibration] engine frames advanced while pumping: ${warm}`);
  if (warm < 10) {
    console.log('!! ABORT — the frame loop is not running, so a pad that is never polled would be');
    console.log('!! indistinguishable from a pad that is polled and ignored. Nothing below is a reading.');
    process.exitCode = 2;
  }

  const before = await stage('A. booted, nothing touched');

  if (wantPad) {
    /* A pad press and NOTHING else: no click, no key. Held well past `§543`'s sampling floor, with
       frames pumped throughout so the poll genuinely happens. */
    await page.evaluate(() => window.__press(0, true));
    const heldFrames = await pump(400);
    await page.evaluate(() => window.__press(0, false));
    await pump(600);
    console.log(`\n[calibration] engine frames advanced while Cross was held: ${heldFrames}`);
    if (heldFrames < 5) console.log('!! the press spanned fewer than 5 polls — widen the hold before believing a negative');
  } else {
    /* A real trusted click, dispatched by the browser at the centre of the viewport — the same
       event a player produces on the "Click to play" line. */
    await page.mouse.click(640, 360);
    await pump(1000);
  }

  const after = await stage(wantPad ? 'B. after ONE pad press (Cross), no click' : 'B. after ONE real click');

  /* Give the stem fetch and decode room, then look again — `trackState` is the music. */
  await pump(6000);
  const settled = await stage('C. +6 s (stem fetch + decode window)');

  /* The fallback the design promises: if the pad left it suspended, a real click must start it. */
  let rescued = null;
  if (wantPad && !settled.audible) {
    await page.mouse.click(640, 360);
    await pump(1500);
    rescued = await stage('D. pad-only failed -> one real click (the §552 fallback)');
  }

  console.log(`\n── audio requests ──`);
  console.log(requests.length ? requests.map((r) => `   ${r}`).join('\n') : '   (none)');
  if (log.length) { console.log(`\n── page log ──`); console.log(log.slice(0, 40).map((l) => `   ${l}`).join('\n')); }

  const final = rescued || settled;
  console.log(`\n── VERDICT (${wantPad ? 'pad-only player' : 'mouse player'}) ──`);
  console.log(`   context exists : ${final.hasCtx}`);
  console.log(`   context state  : ${final.ctxState}`);
  console.log(`   audible        : ${final.audible}`);
  console.log(`   MUSIC playing  : ${final.trackState === 'playing'} (trackState=${final.trackState}, stems=${JSON.stringify(final.stems)})`);
} finally {
  await browser.close().catch(() => {});
  server.kill('SIGTERM');
  setTimeout(() => server.kill('SIGKILL'), 3000);
  release();
}

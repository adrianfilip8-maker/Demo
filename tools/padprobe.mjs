#!/usr/bin/env node
/**
 * padprobe.mjs — does the LIVE game loop poll gamepads at all, and does a pad press/stick
 * deflection reach the real consumers (§516)?
 *
 * `tests/input.test.mjs` arm 6 already drives the mapping, deadzone, hysteresis and edge stamps
 * through `beginFrame` — but it calls `beginFrame` ITSELF, so it cannot answer the one question
 * that killed §468's keyboard edges for the file's whole life: does the SHIPPED loop, in a real
 * browser, actually deliver the device to the code under test? This probe exists for that gap
 * and only that gap. Page-level mock: `navigator.getGamepads` is replaced before boot with a
 * scripted DualShock-4-shaped `standard` pad the arms pose, and every call to it is counted.
 *
 * §540 added the other half of the division of labour, and it is worth stating so neither
 * instrument grows into the other: `tests/padparity.test.mjs` drives EVERY verb on BOTH devices
 * into a real `Controller` + `buildMoveset()` and compares the transitions — the parity question,
 * cheap enough to run per-commit in Node. It structurally cannot ask whether the shipped loop
 * polls, because it calls `beginFrame` itself. This file cannot afford the parity question, because
 * every verb would cost a browser boot. Arm B below therefore stays a SINGLE verb (Cross → jump):
 * it is a liveness check on the loop, not a coverage check on the map.
 *
 * ── DOMAIN (§418.3) ─────────────────────────────────────────────────────────────────────────
 *   passes on : the live rAF loop calling `getGamepads` once per frame over a ≥30-FRAME window
 *               (frames, not wall clock: this container renders in software at single-digit
 *               fps, and the first run's 1.5 s window caught 5 frames and failed its own
 *               sample-size bar — the quantity was bounded by render speed, not by the loop,
 *               §450.4); a posed Cross press CONSUMED — the movement state enters `jump`, with
 *               the `pressed('jump')`/`buffered('jump')` telemetry saying which query took it
 *               (the first run instrumented only `pressed` and read 0 while Sly visibly jumped:
 *               `Jump.canEnter` consumes via `jumpBuffered()` alone, so the buffer is a
 *               first-class consumption route, not a fallback); a SWEPT stick deflection
 *               (0.30 → 0.50 → 0.80 → 1.00) producing strictly increasing `wishMag` and a
 *               > 2 m/s settled-speed span — swept, per §450.4, because a gradient that reports
 *               the same number at four inputs is an instrument fault, not a pass; and the
 *               device flag flipping pad→kbm on a real key, emitting once per change.
 *   fails  on : a loop that stops polling (arm A's ratio bar); a mapping/latch regression (arm
 *               B: no state change and no consuming read); a stick path that quantises to a
 *               two-state switch (arm C's monotone-and-range bars).
 *   does NOT  : discriminate a physical DualShock 4 — no controller exists in this container,
 *   discrim.    so the browser's own HID→`standard` translation for real hardware (button
 *               order, axis sign, drift) is asserted by NOTHING here. That evidence is the
 *               user's, via hardware-sheet item 14's three checks.
 *
 * No screenshots; takes the capture lock only to serialise vite/browser use with the shot tools.
 */
import { chromium } from 'playwright';
import { acquire } from './lock.mjs';
import { spawn, execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import net from 'node:net';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const Q = process.env.Q || 'high';

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
const release = await acquire('input-padprobe');
console.log(`[pad] lock · sha ${sha}`);
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
page.on('pageerror', (e) => console.log(`[pad] pageerror: ${e.message}`));

/* The mock rides in BEFORE any game script: `Input` polls from its first `beginFrame`, and a
   mock installed after boot would miss the frames that prove the loop polls from the start.
   Shape matches what Chromium reports for a DS4 (`standard` mapping, 17 buttons, 4 axes),
   including the `[null,…]` no-pad row a real browser returns. */
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
    axes(a) { state.axes = a.slice(0, 4); },
  };
  window.__padPoll = { calls: 0 };
  const snap = () => ({
    id: 'Wireless Controller (STANDARD GAMEPAD Vendor: 054c Product: 09cc)',
    index: 0, connected: state.connected, mapping: 'standard',
    timestamp: performance.now(),
    buttons: state.buttons.map((b) => ({ pressed: b.pressed, value: b.value })),
    axes: [...state.axes],
  });
  Object.defineProperty(navigator, 'getGamepads', {
    configurable: true,
    value: () => { window.__padPoll.calls++; return state.connected ? [snap(), null, null, null] : [null, null, null, null]; },
  });
});

const fail = (m) => { console.log(`[pad] FAIL — ${m}`); process.exitCode = 1; };

try {
  await page.goto(`http://127.0.0.1:${port}/?shot=1&q=${Q}`, { waitUntil: 'domcontentloaded', timeout: 120000 });
  await page.waitForFunction('window.__GAME && window.__GAME.ready === true', null, { timeout: 600000, polling: 500 });
  console.log('[pad] ready');

  await page.evaluate(() => {
    const e = window.__ENGINE, ip = e.input;
    window.__GAME.hideHud(true);
    e.debug.freeCam = false;
    window.__raw = { pressedSeen: 0, bufferedSeen: 0, devices: [], jumped: false };
    const origPressed = ip.pressed.bind(ip);
    ip.pressed = (a) => {
      const r = origPressed(a);
      if (a === 'jump' && r) window.__raw.pressedSeen++;
      return r;
    };
    const origBuffered = ip.buffered.bind(ip);
    ip.buffered = (a, ms) => {
      const r = origBuffered(a, ms);
      if (a === 'jump' && r) window.__raw.bufferedSeen++;
      return r;
    };
    e.on('inputDevice', (d) => window.__raw.devices.push(d));
    e.on('playerState', (s) => { if (s === 'jump') window.__raw.jumped = true; });
  });
  /**
   * Wait for `n` more engine frames (frame count, not wall clock — see the DOMAIN note).
   * Plain evaluate-polling rather than `waitForFunction`, and a generous budget: this container
   * renders in software AND shares its cores with sibling lanes' suites, so the page has been
   * observed anywhere from ~3 fps down to effectively stalled for a minute at a time. A timeout
   * here still names the observed rate, so a genuinely dead loop stays distinguishable from a
   * starved one.
   */
  const frames = async (n, timeout = 300000) => {
    const f0 = await page.evaluate(() => window.__ENGINE.frame);
    const t0 = Date.now();
    for (;;) {
      await page.waitForTimeout(250);
      const f = await page.evaluate(() => window.__ENGINE.frame);
      if (f - f0 >= n) return;
      if (Date.now() - t0 > timeout) {
        throw new Error(`frames(${n}): only ${f - f0} frames advanced in ${((Date.now() - t0) / 1000).toFixed(0)} s — dead loop or starved container`);
      }
    }
  };
  /* fps precheck, logged so a starved run reads as starved rather than as a probe fault */
  {
    const p0 = await page.evaluate(() => ({ f: window.__ENGINE.frame, t: performance.now() }));
    await page.waitForTimeout(3000);
    const p1 = await page.evaluate(() => ({ f: window.__ENGINE.frame, t: performance.now() }));
    console.log(`[pad] container renders at ${((p1.f - p0.f) / ((p1.t - p0.t) / 1000)).toFixed(2)} fps right now`);
  }

  /* ---- A: the live loop polls pads once per frame, pad connected or not ---- */
  const a0 = await page.evaluate(() => ({ calls: window.__padPoll.calls, frame: window.__ENGINE.frame, t: performance.now() }));
  await frames(30);
  const a1 = await page.evaluate(() => ({ calls: window.__padPoll.calls, frame: window.__ENGINE.frame, t: performance.now() }));
  const calls = a1.calls - a0.calls, nf = a1.frame - a0.frame;
  const fps = nf / ((a1.t - a0.t) / 1000);
  console.log(`[A poll  ] getGamepads called ${calls}× over ${nf} rAF frames (${(calls / Math.max(1, nf)).toFixed(2)}/frame · ${fps.toFixed(1)} fps in this container)`);
  if (nf < 30) fail(`only ${nf} frames elapsed — the wait mechanism is broken, arm A proves nothing`);
  else if (calls < nf * 0.9) fail(`polled ${calls}× in ${nf} frames — the live loop is not polling pads`);

  /* ---- B: Cross → the jump is CONSUMED (state enters 'jump'); telemetry says by which query ---- */
  await page.evaluate(() => { window.__PAD.connect(); });
  const st0 = await page.evaluate(() => window.__ENGINE.get('movement')?.stateName);
  await page.evaluate(() => window.__PAD.press(0));
  await frames(3);                                    // span at least one poll at any fps
  await page.evaluate(() => window.__PAD.lift(0));
  await frames(2);
  const B = await page.evaluate(() => ({
    p: window.__raw.pressedSeen, b: window.__raw.bufferedSeen, jumped: window.__raw.jumped,
    st: window.__ENGINE.get('movement')?.stateName, dev: window.__ENGINE.input.lastDevice,
  }));
  console.log(`[B cross ] state ${st0} → ${B.st} (jumped=${B.jumped}) · consumed via pressed ${B.p}× / buffered ${B.b}× · device ${B.dev}`);
  if (!B.jumped) fail('the Cross press never became the jump state — the pad edge is not reaching the moveset in the live loop');
  if (B.p + B.b < 1) fail('no consuming read (pressed or buffered) ever returned true for jump — the edge latch is broken');
  if (B.dev !== 'pad') fail(`lastDevice is '${B.dev}' after a pad press`);
  {                                                   // land before the sweep — a fixed frame
    const t0 = Date.now();                            // count would race the arc at low fps
    while (!(await page.evaluate(() => !!window.__ENGINE.get('movement')?.grounded))) {
      await page.waitForTimeout(250);
      if (Date.now() - t0 > 300000) { fail('never landed after the jump'); break; }
    }
  }

  /* ---- C: the swept gradient — wishMag and settled speed must RISE with deflection ---- */
  const sweep = [0.30, 0.50, 0.80, 1.00];
  const mags = [], speeds = [];
  for (const d of sweep) {
    await page.evaluate((v) => window.__PAD.axes([0, -v, 0, 0]), d);
    await page.waitForTimeout(900);                      // accelerate to the plateau…
    await frames(6);                                     // …and guarantee real sim frames of it
    const s = await page.evaluate(() => {
      const c = window.__ENGINE.get('movement');
      return { m: c.wishMag, v: c.speed };
    });
    mags.push(s.m); speeds.push(s.v);
    console.log(`[C stick ] deflect ${d.toFixed(2)} → wishMag ${s.m.toFixed(3)} · speed ${s.v.toFixed(2)} m/s`);
  }
  await page.evaluate(() => window.__PAD.axes([0, 0, 0, 0]));
  const runSpeed = 7.2;
  if (!mags.every((m, i) => i === 0 || m > mags[i - 1] + 1e-3)) {
    fail(`wishMag is not strictly increasing across the sweep [${mags.map((m) => m.toFixed(3))}] — the gradient is quantised or the instrument is stuck (§450.4)`);
  }
  if (mags[0] <= 0.25 || mags[0] >= 1 || mags[2] >= 1) fail(`interior deflections must land strictly inside (moveFloor, 1): [${mags.map((m) => m.toFixed(3))}]`);
  if (mags[3] < 0.999) fail(`full deflection delivered wishMag ${mags[3].toFixed(3)}, expected 1`);
  if (!(speeds[3] - speeds[0] > 2)) fail(`speed span ${speeds[0].toFixed(2)} → ${speeds[3].toFixed(2)} m/s — the walk-to-run range has collapsed`);
  if (speeds[3] < runSpeed * 0.8) fail(`full deflection settled at ${speeds[3].toFixed(2)} m/s, expected ≈ ${runSpeed}`);

  /* ---- D: a real key reclaims the device flag from the pad ---- */
  await frames(2);
  await page.keyboard.down('KeyW');
  await frames(2);
  await page.keyboard.up('KeyW');
  const D = await page.evaluate(() => ({ dev: window.__ENGINE.input.lastDevice, emits: window.__raw.devices }));
  console.log(`[D reclaim] device ${D.dev} · inputDevice emits ${JSON.stringify(D.emits)}`);
  if (D.dev !== 'kbm') fail(`a real key press left lastDevice '${D.dev}'`);
  if (!(D.emits.includes('pad') && D.emits[D.emits.length - 1] === 'kbm')) {
    fail(`inputDevice emits ${JSON.stringify(D.emits)} — expected pad claimed then kbm reclaimed`);
  }

  console.log(`[pad] ${process.exitCode ? 'DONE WITH FAILURES' : 'all arms pass'}`);
} finally {
  await browser.close();
  server.kill('SIGTERM');
  release();
  console.log('[pad] released');
}

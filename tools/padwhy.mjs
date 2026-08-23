/**
 * padwhy.mjs — where a pad press stops, read out of the shipped `Input` frame by frame.
 *
 * `tools/padaudio.mjs --pad` measured the outcome: a synthetic DS4 is FOUND (`_padIndex` 0) and a
 * Cross press held for 300 ms still leaves `lastDevice` at `'kbm'` and no AudioContext. This says
 * which link broke, by reading the internals across the press rather than reasoning about them.
 *
 * Usage: node tools/padwhy.mjs
 */
import { chromium } from 'playwright';
import { acquire } from './lock.mjs';
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import net from 'node:net';

const ROOT = path.resolve(import.meta.dirname, '..');
const CHROME = ['/opt/pw-browsers/chromium', '/usr/bin/chromium', '/usr/bin/chromium-browser'];
const ARGS = ['--no-sandbox', '--disable-dev-shm-usage', '--use-gl=angle', '--use-angle=swiftshader',
  '--enable-unsafe-swiftshader', '--enable-webgl', '--ignore-gpu-blocklist', '--hide-scrollbars'];

async function freePort(s = 5700) {
  for (let p = s; p < s + 300; p++) {
    const ok = await new Promise((r) => { const x = net.createServer(); x.once('error', () => r(false)); x.once('listening', () => x.close(() => r(true))); x.listen(p, '127.0.0.1'); });
    if (ok) return p;
  }
  throw new Error('no port');
}
async function startServer(port) {
  const proc = spawn(path.join(ROOT, 'node_modules', '.bin', 'vite'), ['--port', String(port), '--strictPort', '--host', '127.0.0.1'],
    { cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, NO_COLOR: '1', SANDS_NO_HMR: '1' } });
  proc.stdout.on('data', () => {}); proc.stderr.on('data', () => {});
  for (let i = 0; i < 160; i++) {
    const up = await new Promise((r) => { const s = net.connect(port, '127.0.0.1'); s.once('connect', () => { r(true); s.destroy(); }); s.once('error', () => r(false)); s.setTimeout(2000, () => { r(false); s.destroy(); }); });
    if (up) return proc;
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error('vite never listened');
}

const PAD_INIT = `
(() => {
  const pad = { id: 'Wireless Controller (STANDARD GAMEPAD Vendor: 054c Product: 09cc)', index: 0,
    connected: true, mapping: 'standard', timestamp: 0,
    buttons: Array.from({length:17}, () => ({ pressed:false, value:0, touched:false })), axes: [0,0,0,0] };
  window.__PAD = pad;
  window.__press = (i, on) => { pad.buttons[i] = { pressed: !!on, value: on?1:0, touched: !!on }; pad.timestamp = performance.now(); };
  navigator.getGamepads = () => [pad, null, null, null];
})();`;

/* Wrap the shipped methods so the TRACE is of what ran, not of what I think ran. */
const SPY = `
(() => {
  const i = window.__ENGINE.input;
  window.__T = { press: [], adopt: [], setDevice: [], padValue0: [], frames: 0, blur: 0 };
  const P = i._press.bind(i), A = i._adopt.bind(i), S = i._setDevice.bind(i);
  const PV = i._padValue.bind(i), BF = i.beginFrame.bind(i), DAH = i._dropAllHeld.bind(i);
  i._press = (a, s) => { window.__T.press.push(a + ':' + s); return P(a, s); };
  i._adopt = (a, s) => { window.__T.adopt.push(a + ':' + s); return A(a, s); };
  i._setDevice = (d) => { window.__T.setDevice.push(d); return S(d); };
  i._dropAllHeld = () => { window.__T.blur++; return DAH(); };
  i._padValue = (gp, n) => { const v = PV(gp, n); if (n === 0 && v !== 0) window.__T.padValue0.push(v); return v; };
  i.beginFrame = (dt) => { window.__T.frames++; return BF(dt); };
  return true;
})()`;

const DUMP = `
(() => {
  const i = window.__ENGINE.input, t = window.__T;
  return {
    framesSinceSpy: t.frames, blurCalls: t.blur,
    press: t.press.slice(0, 8), adopt: t.adopt.slice(0, 8), setDevice: t.setDevice.slice(0, 8),
    padValue0_nonzero: t.padValue0.length,
    lastDevice: i.lastDevice, padIndex: i._padIndex, padLast: i._padLast,
    padResync: i._padResync, padHeld: [...i._padHeld], padTrust: [...i._padTrust],
    down: [...i._down], srcPad: [...i._src.pad],
    enabled: i.enabled, padEnabled: i.padEnabled,
    rawButton0: (() => { const g = navigator.getGamepads()[0]; return g ? { pressed: g.buttons[0].pressed, value: g.buttons[0].value } : null; })(),
  };
})()`;

const release = await acquire({ onWait: () => {} });
const port = await freePort();
const server = await startServer(port);
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || CHROME.find((p) => existsSync(p)), args: ARGS });
try {
  const page = await (await browser.newContext({ viewport: { width: 1280, height: 720 } })).newPage();
  page.on('pageerror', (e) => console.log('[pageerror]', e.message));
  await page.addInitScript(PAD_INIT);
  await page.goto(`http://127.0.0.1:${port}/`, { waitUntil: 'domcontentloaded', timeout: 90000 });
  await page.waitForFunction('window.__GAME && window.__GAME.ready === true', null, { timeout: 300000, polling: 500 });

  console.log('spy installed:', await page.evaluate(SPY));
  await page.waitForTimeout(500);
  console.log('\n── before the press ──');
  console.log(JSON.stringify(await page.evaluate(DUMP), null, 2));

  await page.evaluate(() => window.__press(0, true));
  await page.waitForTimeout(400);
  console.log('\n── Cross held 400 ms ──');
  console.log(JSON.stringify(await page.evaluate(DUMP), null, 2));

  await page.evaluate(() => window.__press(0, false));
  await page.waitForTimeout(300);
  console.log('\n── Cross released ──');
  console.log(JSON.stringify(await page.evaluate(DUMP), null, 2));
} finally {
  await browser.close().catch(() => {});
  server.kill('SIGTERM'); setTimeout(() => server.kill('SIGKILL'), 3000); release();
}

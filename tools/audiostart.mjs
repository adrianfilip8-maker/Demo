#!/usr/bin/env node
/**
 * audiostart.mjs — where the time goes between page load and the first sound (§550).
 *
 * The user's report from a live playtest: *"The music and sounds take a while to begin playing."*
 * §548 established the audio system works; nobody had ever measured WHEN it starts.
 *
 * This measures the browser half. The offline half — how fast the mixer itself is once a context
 * exists — is `tests/audiolatency.test.mjs`, and it is not slow: measured on the shipping graph,
 * SFX 5 ms, ambience beds 9 ms, procedural score 120 ms from `unlock()`.
 *
 * The four terms this instruments, in the order the player lives through them:
 *
 *   1. BOOT       page load -> `__GAME.ready`. Nothing can make sound before this, because the
 *                 gesture listener that calls `unlock()` is only registered at `main.js:306`,
 *                 after every module has initialised. A player who clicks early clicks nothing.
 *   2. GESTURE    the click itself. A platform rule, not our bug: an AudioContext is born
 *                 suspended and only a trusted gesture may resume it.
 *   3. FETCH      2.24 MB of `bc-explore.mp3`, which begins INSIDE `unlock()` — nothing preloads
 *                 it, there is no <link rel=preload>, and `_loadTrack` has exactly two callers.
 *   4. DECODE     `decodeAudioData` on those bytes, then a 4.0 s cross-fade from the procedural
 *                 score to the stem (`Audio.js`, `const FADE = 4.0`).
 *
 * So the recognisable music is BOOT + GESTURE + FETCH + DECODE + up to 4 s of fade, while the
 * procedural score has been playing since 120 ms after the click. Terms 3 and 4 are ours.
 *
 * Usage: node tools/audiostart.mjs
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
const release = await acquire({ onWait: (s) => console.log(`[start] waiting for the capture lock · ${s}`) });
console.log(`[start] lock · sha ${sha}`);
const port = await freePort();
const server = await startServer(port);
const CHROME = process.env.CHROME_PATH
  || ['/opt/pw-browsers/chromium', '/usr/bin/chromium'].find((p) => existsSync(p));
const browser = await chromium.launch({
  executablePath: CHROME,
  args: ['--no-sandbox', '--disable-dev-shm-usage', '--use-gl=angle', '--use-angle=swiftshader',
    '--enable-unsafe-swiftshader', '--enable-webgl', '--ignore-gpu-blocklist',
    '--js-flags=--max-old-space-size=4096', '--mute-audio', '--autoplay-policy=no-user-gesture-required'],
});
const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
const page = await ctx.newPage();
page.on('pageerror', (e) => console.log(`[start] pageerror: ${e.message}`));

/* Instrument BEFORE any game script runs: wrap fetch and decodeAudioData and stamp everything
   against navigation start, so the terms are measured where they happen rather than inferred. */
await page.addInitScript(() => {
  window.__T = { marks: {}, fetches: [], decodes: [] };
  const t = () => performance.now();
  window.__T.marks.scriptStart = t();

  const realFetch = window.fetch;
  window.fetch = function (...args) {
    const url = String(args[0]?.url ?? args[0] ?? '');
    const t0 = t();
    const p = realFetch.apply(this, args);
    if (/\.mp3(\?|$)/i.test(url)) {
      p.then(async (res) => {
        const clone = res.clone();
        const buf = await clone.arrayBuffer();
        window.__T.fetches.push({ url: url.split('/').pop(), start: t0, end: t(), bytes: buf.byteLength });
      }).catch(() => {});
    }
    return p;
  };

  const wrapDecode = (proto) => {
    if (!proto || proto.__wrapped) return;
    const real = proto.decodeAudioData;
    if (!real) return;
    proto.decodeAudioData = function (buf, ...rest) {
      const bytes = buf?.byteLength ?? -1;
      const t0 = t();
      const r = real.call(this, buf, ...rest);
      if (r?.then) r.then(() => window.__T.decodes.push({ bytes, start: t0, end: t() })).catch(() => {});
      return r;
    };
    proto.__wrapped = true;
  };
  wrapDecode(window.AudioContext?.prototype);
  wrapDecode(window.webkitAudioContext?.prototype);
});

const ms = (v) => (v == null ? '—' : `${v.toFixed(0)} ms`);

try {
  const t0 = Date.now();
  await page.goto(`http://127.0.0.1:${port}/?q=high`, { waitUntil: 'domcontentloaded', timeout: 120000 });
  await page.waitForFunction('window.__GAME && window.__GAME.ready === true', null, { timeout: 600000, polling: 250 });
  await page.evaluate(() => { window.__T.marks.ready = performance.now(); });
  const bootMs = await page.evaluate(() => window.__T.marks.ready);
  console.log(`\n[start] 1. BOOT (page load -> __GAME.ready): ${ms(bootMs)}`);
  console.log('        Nothing can sound before this: the gesture listener that calls unlock()');
  console.log('        is registered at main.js:306, after every module has initialised.');

  /* 2/3/4 — the gesture, then whatever unlock() sets in motion. */
  await page.evaluate(() => { window.__T.marks.click = performance.now(); });
  await page.mouse.click(640, 400);
  /* DO NOT step frames while the fetch and decode are in flight.
     The first version of this tool ran `__GAME.step(4)` in a tight loop here and then reported
     74,685 ms to fetch 2.24 MB **over loopback** and 19,633 ms to decode it. Loopback does not
     take 74 seconds; software-rasterised WebGL frames on the main thread do. The instrument
     manufactured the contention it then measured. Neither term needs frames: `decodeAudioData`
     is off-thread and the fetch is the network stack. Only the procedural score's look-ahead
     scheduler needs `Audio.update`, and that is measured offline in audiolatency.test.mjs. */
  await page.waitForFunction(() => window.__T.decodes.length > 0, null, { timeout: 300000, polling: 250 });

  const T = await page.evaluate(() => window.__T);

  const click = T.marks.click;
  const f = T.fetches[0], d = T.decodes[0];
  console.log(`\n[start] 2. GESTURE: the click is at ${ms(click)}; a suspended context needs it.`);
  if (f) {
    console.log(`\n[start] 3. FETCH  ${f.url}  ${(f.bytes / 1048576).toFixed(2)} MB`);
    console.log(`        began ${ms(f.start - click)} after the click — i.e. inside unlock(), not before it`);
    console.log(`        took  ${ms(f.end - f.start)} on loopback (a real network will be slower)`);
  } else console.log('\n[start] 3. FETCH  — no mp3 fetch observed');
  if (d) {
    console.log(`\n[start] 4. DECODE ${(d.bytes / 1048576).toFixed(2)} MB -> ${ms(d.end - d.start)}`);
    console.log(`        first stem audible from ${ms(d.end - click)} after the click, then a 4.0 s`);
    console.log(`        cross-fade (Audio.js FADE = 4.0) before it reaches full level.`);
    console.log(`\n[start] RECOGNISABLE MUSIC ~= ${ms((d.end - click) + 4000)} after the click,`);
    console.log(`        on top of ${ms(bootMs)} of boot. The procedural score has been playing`);
    console.log('        since ~120 ms after the click throughout.');
  } else console.log('\n[start] 4. DECODE — no decode observed');
} catch (err) {
  console.log(`[start] FAIL — ${err?.message || err}`);
  process.exitCode = 1;
} finally {
  await browser.close().catch(() => {});
  server.kill('SIGTERM');
  try { release?.(); } catch {}
}

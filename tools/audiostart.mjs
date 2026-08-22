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
  /* EARLY=1 clicks DURING the loading screen — the §551 case. The click is aimed at the progress
     bar, which is what a player actually does, and before §551 it hit no handler at all. */
  const EARLY = process.env.EARLY === '1';
  await page.goto(`http://127.0.0.1:${port}/?q=high`, { waitUntil: 'domcontentloaded', timeout: 120000 });

  if (EARLY) {
    await page.waitForTimeout(2000);                       // mid-boot, long before ready
    const readyYet = await page.evaluate(() => !!window.__GAME?.ready);
    /* Mark BEFORE dispatching. Marking after it meant a fetch triggered BY the click timestamped
       ~57 ms EARLIER than the click, and the report then labelled it "PREFETCHED, before the
       gesture" — evidence for a mechanism that had not run at all. The label was the instrument's,
       not the game's. */
    await page.evaluate(() => { window.__T.marks.click = performance.now(); });
    await page.mouse.click(640, 400);
    const unlocked = await page.evaluate(() => !!(window.__GAME && document.querySelector('canvas')) && true);
    console.log(`\n[start] EARLY CLICK at ~2 s: __GAME.ready was ${readyYet} at click time`);
  }

  await page.waitForFunction('window.__GAME && window.__GAME.ready === true', null, { timeout: 600000, polling: 250 });
  await page.evaluate(() => { window.__T.marks.ready = performance.now(); });
  const bootMs = await page.evaluate(() => window.__T.marks.ready);
  console.log(`\n[start] 1. BOOT (page load -> __GAME.ready): ${ms(bootMs)}`);
  console.log('        Nothing can sound before this UNLESS the gesture was captured during boot');
  console.log('        (§551). main.js:306 still registers its own listener only after boot.');

  if (!EARLY) {
    await page.evaluate(() => { window.__T.marks.click = performance.now(); });
    await page.mouse.click(640, 400);
  }
  await page.waitForFunction(() => window.__T.decodes.length > 0, null, { timeout: 300000, polling: 250 });
  const T = await page.evaluate(() => window.__T);

  const click = T.marks.click;
  const f = T.fetches[0], d = T.decodes[0];
  console.log(`\n[start] 2. GESTURE at ${ms(click)}${EARLY ? '  (DURING boot)' : '  (after boot)'}`);
  if (f) {
    console.log(`\n[start] 3. FETCH  ${f.url}  ${(f.bytes / 1048576).toFixed(2)} MB`);
    console.log(`        began ${ms(f.start - click)} relative to the click`
      + `${f.start < click - 5 ? '  <-- began BEFORE the gesture, i.e. prefetched (§551)' : '  (triggered by the gesture)'}`);
    console.log(`        took  ${ms(f.end - f.start)} on loopback (a real network will be slower)`);
  } else console.log('\n[start] 3. FETCH  — no mp3 fetch observed');
  if (d) {
    console.log(`\n[start] 4. DECODE ${(d.bytes / 1048576).toFixed(2)} MB -> ${ms(d.end - d.start)}`);
    console.log(`        first stem audible ${ms(d.end - click)} after the click, then a 4.0 s cross-fade.`);
  }
} catch (err) {
  console.log(`[start] FAIL — ${err?.message || err}`);
  process.exitCode = 1;
} finally {
  await browser.close().catch(() => {});
  server.kill('SIGTERM');
  try { release?.(); } catch {}
}

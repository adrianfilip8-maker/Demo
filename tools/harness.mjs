/**
 * Shared browser harness: boots Vite, opens the game in headless Chromium, hands you a page
 * with `window.__GAME` ready, and cleans up after itself.
 *
 * `tools/shot.mjs` predates this and keeps its own copy of the boot logic so that refactoring
 * it can't break agent runs already in flight; fold it in here once the fan-out is done.
 */
import { chromium } from 'playwright';
import { acquire } from './lock.mjs';
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import net from 'node:net';

export const ROOT = path.resolve(import.meta.dirname, '..');

const CHROME_CANDIDATES = ['/opt/pw-browsers/chromium', '/usr/bin/chromium', '/usr/bin/chromium-browser'];

// No GPU in this container: ANGLE over SwiftShader is the only way WebGL2 initialises.
const CHROME_ARGS = [
  '--no-sandbox',
  '--disable-dev-shm-usage',
  '--use-gl=angle',
  '--use-angle=swiftshader',
  '--enable-unsafe-swiftshader',
  '--enable-webgl',
  '--ignore-gpu-blocklist',
  '--disable-frame-rate-limit',
  '--js-flags=--max-old-space-size=4096',
  '--force-device-scale-factor=1',
  '--hide-scrollbars',
  '--mute-audio',
];

async function freePort(start = 5400) {
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

async function startServer(port, verbose) {
  const bin = path.join(ROOT, 'node_modules', '.bin', 'vite');
  if (!existsSync(bin)) throw new Error('vite not installed — run npm install');
  const proc = spawn(bin, ['--port', String(port), '--strictPort', '--host', '127.0.0.1'], {
    cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, NO_COLOR: '1' },
  });
  let log = '';
  const cap = (d) => { log += d; if (verbose) process.stdout.write(`[vite] ${d}`); };
  proc.stdout.on('data', cap);
  proc.stderr.on('data', cap);

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
  throw new Error(`vite never listened on ${port}:\n${log}`);
}

/**
 * Boot everything, run `fn({ page, info })`, tear down. Returns fn's value.
 * `info` carries the module map, boot warnings, and the WebGL renderer string.
 */
export async function withGame(
  { width = 1280, height = 720, quality = 'high', timeout = 300000, verbose = false } = {},
  fn
) {
  // Serialise with other capture runs — software rendering doesn't parallelise, it thrashes.
  const release = await acquire({
    onWait: (ms, pid) => process.stdout.write(`· waiting for capture lock (${(ms / 1000) | 0}s, held by pid ${pid})\n`),
  });

  const port = await freePort();
  const server = await startServer(port, verbose);
  const executablePath = process.env.CHROME_PATH || CHROME_CANDIDATES.find((p) => existsSync(p));
  const browser = await chromium.launch({ executablePath, args: CHROME_ARGS });

  const consoleErrors = [];
  try {
    const ctx = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 1 });
    const page = await ctx.newPage();
    page.on('console', (m) => {
      if (m.type() === 'error') consoleErrors.push(m.text());
      if (verbose) console.log(`  [page:${m.type()}] ${m.text()}`);
    });
    page.on('pageerror', (e) => consoleErrors.push(`pageerror: ${e.message}`));

    await page.goto(`http://127.0.0.1:${port}/?shot=1&q=${quality}`,
      { waitUntil: 'domcontentloaded', timeout: 90000 });
    await page.waitForFunction('window.__GAME && window.__GAME.ready === true', null,
      { timeout, polling: 500 });

    const info = await page.evaluate(() => ({
      shots: window.__GAME.shots,
      modules: window.__GAME.modules(),
      warnings: window.__GAME.warnings.slice(),
      poses: window.__GAME.poses(),
      renderer: (() => {
        const gl = window.__ENGINE?.renderer?.getContext?.();
        const d = gl?.getExtension('WEBGL_debug_renderer_info');
        return d ? gl.getParameter(d.UNMASKED_RENDERER_WEBGL) : 'unknown';
      })(),
    }));
    info.consoleErrors = consoleErrors;

    return await fn({ page, info });
  } finally {
    await browser.close().catch(() => {});
    server.kill('SIGTERM');
    setTimeout(() => server.kill('SIGKILL'), 3000);
    release();
  }
}

/** Pose a canonical shot and return `{ stats, dataUrl }`. */
export async function grab(page, name, { mime = 'image/png', quality = 0.92, maxWidth = 0 } = {}) {
  return page.evaluate(
    async ([n, m, q, w]) => {
      const r = await window.__GAME.setShot(n);
      return { stats: r.stats, warnings: r.warnings.length, dataUrl: window.__GAME.capture(m, q, w) };
    },
    [name, mime, quality, maxWidth]
  );
}

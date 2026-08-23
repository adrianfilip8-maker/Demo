#!/usr/bin/env node
/**
 * elblook.mjs — the §479.6 elbow-open lever on camera: the same walk beat, shipped model, with
 * the lever at 0 (ships — the repo's own bent-arm creep) and at the suggested 0.35, so the user
 * judges the knob from frames instead of adjectives. One invocation is one arm; phase-matched at
 * stride phase 0.25/0.75 exactly like moveslook's gait takes.
 *
 *   node tools/elblook.mjs                 lever 0     -> shots/elb1/k0-*
 *   K=0.35 node tools/elblook.mjs         lever 0.35  -> shots/elb1/k35-*
 */
import { chromium } from 'playwright';
import { acquire } from './lock.mjs';
import { spawn, execFileSync } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import net from 'node:net';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const OUT = process.env.OUT || `${ROOT}/shots/elb1`;
const W = Number(process.env.W || 1600), H = Number(process.env.H || 900);
const K = Number(process.env.K || 0);
const SETTLE = Number(process.env.SETTLE || 55);
const RESET_Z = Number(process.env.RESET_Z || 30);
const ARM = K > 0 ? `k${Math.round(K * 100)}` : 'k0';

async function freePort(start = 5800) {
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
await mkdir(OUT, { recursive: true });
const release = await acquire('elblook');
console.log(`[elb] lock · sha ${sha} · arm ${ARM} (K=${K})`);

const port = await freePort();
const server = await startServer(port);
const CHROME = process.env.CHROME_PATH
  || ['/opt/pw-browsers/chromium', '/usr/bin/chromium'].find((p) => existsSync(p));
const browser = await chromium.launch({
  executablePath: CHROME,
  args: ['--no-sandbox', '--disable-dev-shm-usage', '--use-gl=angle', '--use-angle=swiftshader',
    '--enable-unsafe-swiftshader', '--enable-webgl', '--ignore-gpu-blocklist',
    '--disable-frame-rate-limit', '--force-device-scale-factor=1', '--hide-scrollbars', '--mute-audio'],
});
const ctx = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
const page = await ctx.newPage();
const errs = [];
page.on('pageerror', (e) => errs.push(`pageerror: ${e.message}`));
page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });

const log = [];
try {
  if (K > 0) await page.addInitScript((k) => { window.__ELBOW_OPEN = { walk: k, run: k, run_fast: k }; }, K);
  await page.goto(`http://127.0.0.1:${port}/?shot=1&q=high`, { waitUntil: 'domcontentloaded', timeout: 120000 });
  await page.waitForFunction('window.__GAME && window.__GAME.ready === true', null, { timeout: 600000, polling: 500 });
  await page.evaluate((rz) => {
    window.__RESETZ = rz;
    window.__ENGINE.stopLoop();
    window.__GAME.hideHud(true);
    window.__ENGINE.debug.freeCam = false;
    window.__ENGINE.input.locked = true;
    const e = window.__ENGINE;
    window.__MOVEMAG = null;
    window.__simStep = (n, dt) => {
      for (let i = 0; i < n; i++) {
        e.input?.beginFrame?.();
        if (window.__MOVEMAG != null) { e.input.move.x = 0; e.input.move.y = window.__MOVEMAG; }
        e.dt = Math.min(dt, 1 / 20) * e.timeScale;
        if (e.debug.paused || e.paused) e.dt = 0;
        e.time += e.dt; e.frame++;
        for (const { mod } of e._ordered) {
          if (typeof mod.update === 'function') { try { mod.update(e.dt, e.time); } catch {} }
        }
      }
    };
  }, RESET_Z);
  const sim = (n = 1) => page.evaluate((k) => window.__simStep(k, 1 / 60), n);
  const snap = async (name, az = 90, dist = 2.6, h = 1.15) => {
    const tel = await page.evaluate(([azDeg, d, hh]) => {
      const e = window.__ENGINE, m = e.get('movement'), a = e.get('animation');
      const yaw = m.yaw ?? 0;
      const a2 = yaw + (azDeg * Math.PI / 180);
      e.debug.freeCam = true;
      e.camera.position.set(m.position.x + Math.sin(a2) * d, m.position.y + hh, m.position.z + Math.cos(a2) * d);
      e.camera.lookAt(m.position.x, m.position.y + 0.95, m.position.z);
      e.camera.updateMatrixWorld(true);
      return { phase: +(a?.phase ?? 0).toFixed(3), sp: +(m?.speedXZ?.() ?? 0).toFixed(2) };
    }, [az, dist, h]);
    const uri = await page.evaluate(() => window.__GAME.capture('image/png'));
    await page.evaluate(() => { window.__ENGINE.debug.freeCam = false; });
    await writeFile(`${OUT}/${ARM}-${name}.png`, Buffer.from(uri.split(',')[1], 'base64'));
    log.push({ frame: `${ARM}-${name}`, ...tel });
    console.log(`  -> ${ARM}-${name}.png  ${JSON.stringify(tel)}`);
  };
  const atPhase = async (target) => {
    for (let g = 0; g < 300; g++) {
      const ph = await page.evaluate(() => (window.__ENGINE.get('animation')?.phase ?? 0) % 1);
      if (Math.abs(ph - target) < 0.02) return;
      await sim(1);
    }
  };

  await sim(30);
  await page.evaluate(() => { const m = window.__ENGINE.get('movement'); m.position.set(0, 0, window.__RESETZ); m.velocity.set(0, 0, 0); });
  await sim(30);
  await page.evaluate(() => { window.__MOVEMAG = 0.45; });
  await sim(SETTLE);
  await atPhase(0.25); await snap('walk-a-profile', 90);
  /* §479.14 WARNING: az 145 is cam·facing −0.82 — a REAR three-quarter, not a front one.
     The §479.6 elbow pair was judged on the PROFILE frames, which are correctly named. */
  await snap('walk-a-front34', 145, 2.3);
  await atPhase(0.75); await snap('walk-b-profile', 90);
  await page.evaluate(() => { window.__MOVEMAG = 0.75; });
  await sim(90);
  await atPhase(0.25); await snap('run-a-profile', 90);
} finally {
  await writeFile(`${OUT}/telemetry-${ARM}.json`, JSON.stringify({ sha, K, W, H, errs, log }, null, 2));
  await browser.close().catch(() => {});
  server.kill('SIGTERM');
  await release();
  console.log(`[elb] done · errs ${errs.length}`);
  if (errs.length) console.log(errs.slice(0, 6).join('\n'));
}

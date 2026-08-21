#!/usr/bin/env node
/**
 * jumplook.mjs — the §479.7 launch pace on camera: sprint + held jump, frames at fixed sim
 * offsets after the press, with the jump_rise track's own playhead (t / dur = delivered
 * fraction) in the telemetry beside every frame. Before/after differ by Animation.js alone
 * (the `rate` row in GODOT_ALIAS); run the before arm with Animation.js stashed to HEAD.
 *
 *   node tools/jumplook.mjs                  -> shots/jump1/after-*
 *   TAG=before node tools/jumplook.mjs      -> shots/jump1/before-*
 */
import { chromium } from 'playwright';
import { acquire } from './lock.mjs';
import { spawn, execFileSync } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import net from 'node:net';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const OUT = process.env.OUT || `${ROOT}/shots/jump1`;
const W = Number(process.env.W || 1600), H = Number(process.env.H || 900);
const TAG = process.env.TAG || 'after';

async function freePort(start = 5900) {
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
const dirty = execFileSync('git', ['status', '--porcelain', '--', 'src/'], { cwd: ROOT, encoding: 'utf8' }).trim();
await mkdir(OUT, { recursive: true });
const release = await acquire('jumplook');
console.log(`[jump] lock · sha ${sha}${dirty ? ' · DIRTY' : ' · clean'} · arm ${TAG}`);

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
  await page.goto(`http://127.0.0.1:${port}/?shot=1&q=high`, { waitUntil: 'domcontentloaded', timeout: 120000 });
  await page.waitForFunction('window.__GAME && window.__GAME.ready === true', null, { timeout: 600000, polling: 500 });
  await page.evaluate(() => {
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
  });
  const sim = (n = 1) => page.evaluate((k) => window.__simStep(k, 1 / 60), n);
  const snap = async (name, az = 90, dist = 2.9, h = 1.35) => {
    const tel = await page.evaluate(([azDeg, d, hh]) => {
      const e = window.__ENGINE, m = e.get('movement'), a = e.get('animation');
      const yaw = m.yaw ?? 0;
      const a2 = yaw + (azDeg * Math.PI / 180);
      e.debug.freeCam = true;
      e.camera.position.set(m.position.x + Math.sin(a2) * d, m.position.y + hh, m.position.z + Math.cos(a2) * d);
      e.camera.lookAt(m.position.x, m.position.y + 1.0, m.position.z);
      e.camera.updateMatrixWorld(true);
      const tr = (a?.tracks || []).filter((t) => t.clip && t.w > 0.01)
        .map((t) => ({ n: t.clip.name, w: +t.w.toFixed(2), t: +t.time.toFixed(3), dur: t.clip.dur }));
      return { vy: +(m?.velocity?.y ?? 0).toFixed(2), st: m?.stateName, tr };
    }, [az, dist, h]);
    const uri = await page.evaluate(() => window.__GAME.capture('image/png'));
    await page.evaluate(() => { window.__ENGINE.debug.freeCam = false; });
    await writeFile(`${OUT}/${TAG}-${name}.png`, Buffer.from(uri.split(',')[1], 'base64'));
    log.push({ frame: `${TAG}-${name}`, ...tel });
    const rise = tel.tr.find((x) => x.n === 'jump_rise');
    console.log(`  -> ${TAG}-${name}.png  vy ${tel.vy}  rise ${rise ? `${rise.t}/${rise.dur} (${(rise.t / rise.dur * 100).toFixed(0)}%) w ${rise.w}` : '—'}`);
  };

  await sim(30);
  await page.evaluate(() => { const m = window.__ENGINE.get('movement'); m.position.set(0, 0, 30); m.velocity.set(0, 0, 0); });
  await sim(30);
  await page.evaluate(() => { window.__MOVEMAG = 1.0; });
  await sim(Number(process.env.JSETTLE || 26));
  await page.keyboard.down('Space');
  await sim(2); await snap('rise-f2');
  await sim(4); await snap('rise-f6');
  await sim(4); await snap('rise-f10');
  await sim(4); await snap('rise-f14');
  await sim(4); await snap('rise-f18');
  await page.keyboard.up('Space');
  /* through the apex into the fall — Falling is deliberately NOT retimed; the frame + track row
     record that its delivered rate is 1.0, the same as both of their tree's own fall bindings */
  let guard = 0;
  while (guard++ < 140) {
    await sim(1);
    const done = await page.evaluate(() => {
      const a = window.__ENGINE.get('animation');
      const tr = (a?.tracks || []).find((t) => t.clip && t.clip.name === 'jump_fall');
      return tr && tr.w > 0.6;
    });
    if (done) break;
  }
  await snap('fall');
} finally {
  await writeFile(`${OUT}/telemetry-${TAG}.json`, JSON.stringify({ sha, dirty, W, H, TAG, errs, log }, null, 2));
  await browser.close().catch(() => {});
  server.kill('SIGTERM');
  await release();
  console.log(`[jump] done · errs ${errs.length}`);
  if (errs.length) console.log(errs.slice(0, 6).join('\n'));
}

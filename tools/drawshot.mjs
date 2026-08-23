#!/usr/bin/env node
/**
 * drawshot.mjs — photograph the drawn-root easing (§604 item 4).
 *
 *   node tools/drawnease.mjs --frames > /tmp/f.json   # measure the staging first
 *   node tools/drawshot.mjs /tmp/f.json               # then photograph it
 *   node tools/drawshot.mjs /tmp/f.json 1 2           # only rings 1 and 2
 *
 * WHY THE FRAMES ARE STAGED AND NOT GRABBED. A canonical shot cannot photograph this. `setShot`
 * turns on `freeCam`, and the freeCam branch of `Controller.update` deliberately SPENDS the easing
 * offset so a posed frame is drawn exactly where the recipe put it — that is a correctness
 * property (`Debug.js`:184 reads the root back to record where Sly was staged), not an oversight.
 * A capture that ran the simulation instead would be a different tool with a different lock cost.
 *
 * So each pair here is ONE measured simulation frame drawn twice: `drawnease.mjs --frames` runs the
 * real chain with the real `CameraRig` and writes out, at each catch, where the camera was, where
 * the capsule was, and where the drawn body was with the easing in force. This puts the character
 * root at each of those two positions under that same camera. The positions are measured; only the
 * shutter is staged. `capsule` is what shipped before §604 — the undamped copy — and `drawn` is
 * what ships now, so the pair is a genuine before/after of the same instant.
 *
 * Takes the same FIFO capture lock as `shot.mjs`; each frame is minutes of software rasterising.
 */
import { chromium } from 'playwright';
import { acquire } from './lock.mjs';
import { spawn } from 'node:child_process';
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import net from 'node:net';

const ROOT = path.resolve(import.meta.dirname, '..');
const W = +(process.env.W || 1280), H = +(process.env.H || 720), Q = process.env.Q || 'high';
/* Subdirectories of `shots` are gitignored and top-level `shots/*.png` is not, so frames meant to
   be reviewable from the repo have to land in the top directory with a self-describing prefix —
   the convention the camera lane's `camlane-*.png` already follows among 419 siblings. */
const OUTDIR = path.join(ROOT, process.env.OUT || 'shots');
const PREFIX = process.env.PREFIX ?? 'draw-';

const args = process.argv.slice(2);
const SRC = args[0];
const WANT = args.slice(1).map(Number).filter(Number.isFinite);
if (!SRC) { process.stderr.write('usage: drawshot.mjs <frames.json> [ring...]\n'); process.exit(2); }

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
  const bin = path.join(ROOT, 'node_modules', '.bin', 'vite');
  if (!existsSync(bin)) throw new Error('vite not installed');
  const proc = spawn(bin, ['--port', String(port), '--strictPort', '--host', '127.0.0.1'], {
    cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, NO_COLOR: '1', SANDS_NO_HMR: '1' },
  });
  let log = '';
  proc.stdout.on('data', (d) => { log += d; });
  proc.stderr.on('data', (d) => { log += d; });
  const deadline = Date.now() + 60000;
  while (Date.now() < deadline) {
    if (/localhost:\d+|ready in/i.test(log)) break;
    if (proc.exitCode !== null) throw new Error(`vite exited (${proc.exitCode}):\n${log}`);
    await new Promise((r) => setTimeout(r, 250));
  }
  for (let i = 0; i < 80; i++) {
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

async function main() {
  const rows = JSON.parse(await readFile(SRC, 'utf8'));
  const picks = rows.filter((r) => !WANT.length || WANT.includes(r.ring));
  if (!picks.length) throw new Error('no rings selected');
  await mkdir(OUTDIR, { recursive: true });

  const release = await acquire({
    onWait: (ms, pid) => process.stdout.write(`· waiting for capture lock (${(ms / 1000) | 0}s, pid ${pid})\n`),
  });
  process.on('exit', release);
  const port = await freePort();
  const server = await startServer(port);
  const CHROME = process.env.CHROME_PATH
    || ['/opt/pw-browsers/chromium', '/usr/bin/chromium', '/usr/bin/chromium-browser'].find((p) => existsSync(p));
  const browser = await chromium.launch({
    executablePath: CHROME,
    args: ['--no-sandbox', '--disable-dev-shm-usage', '--use-gl=angle', '--use-angle=swiftshader',
      '--enable-unsafe-swiftshader', '--enable-webgl', '--ignore-gpu-blocklist',
      '--disable-frame-rate-limit', '--js-flags=--max-old-space-size=4096',
      '--force-device-scale-factor=1', '--hide-scrollbars', '--mute-audio'],
  });
  const report = { at: new Date().toISOString(), width: W, height: H, quality: Q, frames: {}, errors: [] };
  try {
    const ctx = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
    const page = await ctx.newPage();
    const errs = [];
    page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
    page.on('pageerror', (e) => errs.push(`pageerror: ${e.message}`));
    process.stdout.write('· loading game\n');
    await page.goto(`http://127.0.0.1:${port}/?shot=1&q=${Q}`, { waitUntil: 'domcontentloaded', timeout: 90000 });
    await page.waitForFunction('window.__GAME && window.__GAME.ready === true', null, { timeout: 600000, polling: 500 });
    process.stdout.write('· ready\n');
    await page.evaluate(() => window.__GAME.setShot('interior'));
    /* A throwaway frame pays the shader-program warm-up, which otherwise lands on the first real
       capture and returns a flat field. Same reason `ventshot.mjs` does it. */
    await page.evaluate(async () => { await window.__GAME.step(12, 1 / 60); window.__GAME.capture(); });

    for (const r of picks) {
      for (const which of ['before', 'after']) {
        const name = `${PREFIX}ring${r.ring}-${which}`;
        const t0 = Date.now();
        const spec = {
          pos: which === 'before' ? r.capsule : r.drawn,
          yaw: r.yaw, cam: r.cam, look: r.look, fov: r.fov,
        };
        try {
          const png = await Promise.race([
            page.evaluate(async (F) => {
              const g = window.__GAME, e = g.engine;
              const place = () => {
                const ch = e.get('character');
                if (ch?.root) {
                  ch.root.position.set(...F.pos);
                  ch.root.rotation.set(0, F.yaw, 0);
                  ch.root.visible = true;
                  ch.root.updateMatrixWorld(true);
                }
                e.camera.fov = F.fov;
                e.camera.up.set(0, 1, 0);
                e.camera.position.set(...F.cam);
                e.camera.lookAt(...F.look);
                e.camera.updateProjectionMatrix();
                e.camera.updateMatrixWorld(true);
              };
              /* Placed, stepped so shadows and FX settle, then placed AGAIN: `Controller.update`
                 runs inside `step` even in shot mode and its freeCam branch calls
                 `_pushCharacter`, which would put the root back on the capsule and quietly turn
                 the "after" frame into a second copy of the "before" one. The second call is what
                 makes the pair a pair. */
              place();
              await g.step(8, 1 / 60);
              place();
              return g.capture();
            }, spec),
            new Promise((_, rej) => setTimeout(() => rej(new Error('timed out after 600s')), 600000)),
          ]);
          const file = path.join(OUTDIR, `${name}.png`);
          await writeFile(file, Buffer.from(png.split(',')[1], 'base64'));
          report.frames[name] = { file: path.relative(ROOT, file), ms: Date.now() - t0, pos: spec.pos, lag: r.lag };
          process.stdout.write(`  ✓ ${name.padEnd(16)} ${String(Date.now() - t0).padStart(6)}ms  at [${spec.pos}]\n`);
        } catch (err) {
          report.errors.push(`${name}: ${err.message}`);
          process.stdout.write(`  ✗ ${name.padEnd(16)} ${err.message}\n`);
        }
      }
    }
    report.errors.push(...errs.slice(0, 10));
  } finally {
    await browser.close().catch(() => {});
    server.kill('SIGTERM');
    release();
  }
  await writeFile(path.join(OUTDIR, `${PREFIX}report.json`), JSON.stringify(report, null, 2));
  process.stdout.write(`· ${Object.keys(report.frames).length} frames -> ${path.relative(ROOT, OUTDIR)}\n`);
  if (report.errors.length) process.stdout.write(`· errors: ${report.errors.join(' | ')}\n`);
}

main().catch((e) => { process.stderr.write(`drawshot failed: ${e.stack || e}\n`); process.exit(1); });

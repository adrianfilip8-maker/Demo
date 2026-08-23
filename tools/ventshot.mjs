#!/usr/bin/env node
/**
 * ventshot.mjs — photograph the §600 vent passage from cameras that are NOT in `Shots.js`.
 *
 * `shot.mjs` can only render names in the canonical `SHOTS` table, and adding four entries there
 * would lengthen the critic's default set for everyone to look at one lane's tunnel. `__GAME`
 * exposes `engine`, `step` and `capture`, and `setShot` is what puts the renderer into capture
 * mode (rAF stopped, `freeCam` on, HUD hidden), so: stage on the nearest canonical shot, then
 * drive the camera and the staged player by hand and grab the frame.
 *
 *   node tools/ventshot.mjs                  all frames, 1280x720, quality high
 *   node tools/ventshot.mjs mouth gallery    just those
 *   W=1600 H=900 node tools/ventshot.mjs
 *
 * Takes the same FIFO capture lock as `shot.mjs`. Two frames is ~5 minutes of exclusive hold on
 * this container's software rasteriser; keep runs short.
 */
import { chromium } from 'playwright';
import { acquire } from './lock.mjs';
import { spawn } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import net from 'node:net';

const ROOT = path.resolve(import.meta.dirname, '..');
const W = +(process.env.W || 1280), H = +(process.env.H || 720), Q = process.env.Q || 'high';
const OUTDIR = path.join(ROOT, process.env.OUT || 'shots/vent');

/** [name, camera pos, look-at, fov, time of day, staged player pos + yaw + pose] */
const FRAMES = {
  /* 1. The mouth, from inside the hall. The thing the player meets: a cut doorway in the north
        wall's base with a ramp running down into it, where §565 left a bricked-up panel.
        Shot from 8 m and not from 3: at close range the staged character is a flat unlit slab
        filling two thirds of the frame — two takes were lost to that before the cause was
        measured, because a ray probe of the LEVEL finds nothing near the lens and says the
        camera is clear. The subject is geometry too. */
  mouth: {
    pos: [-18.30, 2.30, -43.6], look: [-21.85, -0.70, -50.2], fov: 52, tod: 0.62,
    player: { pos: [-21.85, -0.30, -49.3], yaw: Math.PI, pose: 'crawl' },
  },
  /* 2. Inside the shaft, looking down it — the 24 m of interior §565 priced and declined. */
  shaft: {
    pos: [-21.85, -1.15, -51.0], look: [-21.85, -4.6, -61.4], fov: 62, tod: 0.62,
    player: { pos: [-21.85, -3.30, -56.6], yaw: Math.PI, pose: 'crawl' },
  },
  /* 3. The east run, looking back west up the tunnel from just inside the crypt portal. */
  run: {
    pos: [-13.0, -4.75, -63.0], look: [-22.4, -4.90, -63.0], fov: 60, tod: 0.62,
    player: { pos: [-17.4, -5.40, -63.0], yaw: Math.PI / 2, pose: 'crawl' },
  },
  /* 4. The arrival. From the crypt floor, looking up at the gallery, the portal and the stair. */
  gallery: {
    pos: [-4.6, -8.6, -66.6], look: [-11.6, -5.6, -64.6], fov: 55, tod: 0.62,
    player: { pos: [-11.4, -5.40, -63.4], yaw: 1.9, pose: 'crouch_idle' },
  },
  /* 5. The vantage, which is the reason the arrival is worth reaching: standing ON the gallery,
        looking down the burial chamber at the sarcophagus past the granite piers. This is
        `ventroute` R4's sightline with a lens on it — the eye is the same 1.55 m over the ledge
        the arm searches from. */
  vantage: {
    pos: [-11.30, -3.85, -66.8], look: [0.55, -9.40, -71.70], fov: 62, tod: 0.62,
    player: { pos: [-11.30, -5.40, -65.6], yaw: 2.3, pose: 'sneak_idle' },
  },
};

const argv = process.argv.slice(2);
const want = argv.length ? argv : Object.keys(FRAMES);

async function freePort(start = 5400) {
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
  await mkdir(OUTDIR, { recursive: true });
  const release = await acquire({
    onWait: (ms, pid) => process.stdout.write(`· waiting for capture lock (${(ms / 1000) | 0}s, pid ${pid})\n`),
  });
  process.on('exit', release);
  const port = await freePort();
  const server = await startServer(port);
  /* Same pinned binary and the same flags `shot.mjs` uses: this container has no GPU, and
     Playwright's own bundled revision is not the one that is installed. */
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
    const consoleErrors = [];
    page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text()); });
    page.on('pageerror', (e) => consoleErrors.push(`pageerror: ${e.message}`));
    process.stdout.write('· loading game\n');
    await page.goto(`http://127.0.0.1:${port}/?shot=1&q=${Q}`, { waitUntil: 'domcontentloaded', timeout: 90000 });
    await page.waitForFunction('window.__GAME && window.__GAME.ready === true', null, { timeout: 600000, polling: 500 });
    process.stdout.write('· ready\n');
    /* Stage once on the tomb's own canonical shot: that is what stops the rAF loop, turns on
       freeCam, hides the HUD and freezes a pose. Everything after this is hand-aimed. */
    await page.evaluate(() => window.__GAME.setShot('interior'));
    /* A throwaway frame before the first real one. The first capture of a boot came back a flat
       blue field: it costs the whole shader-program warm-up (417 s against 31-108 s for the
       three after it) and the three settle steps below are not enough to pay for it. */
    await page.evaluate(async () => { await window.__GAME.step(12, 1 / 60); window.__GAME.capture(); });

    for (const name of want) {
      const f = FRAMES[name];
      if (!f) { process.stdout.write(`  ? unknown frame ${name}\n`); continue; }
      const t0 = Date.now();
      try {
        const png = await Promise.race([
          page.evaluate(async (F) => {
            const g = window.__GAME, e = g.engine;
            const ch = e.get('character');
            if (ch?.root && F.player) {
              ch.root.position.set(...F.player.pos);
              ch.root.rotation.set(0, F.player.yaw, 0);
              ch.root.visible = true;
              try { e.get('animation')?.freezePose?.(F.player.pose); } catch { /* pose may not exist */ }
            }
            g.setTimeOfDay(F.tod);
            e.camera.fov = F.fov;
            e.camera.position.set(...F.pos);
            e.camera.up.set(0, 1, 0);
            e.camera.lookAt(...F.look);
            e.camera.updateProjectionMatrix();
            e.camera.updateMatrixWorld(true);
            await g.step(8, 1 / 60);
            e.camera.fov = F.fov;
            e.camera.position.set(...F.pos);
            e.camera.lookAt(...F.look);
            e.camera.updateProjectionMatrix();
            e.camera.updateMatrixWorld(true);
            return g.capture();
          }, f),
          new Promise((_, rej) => setTimeout(() => rej(new Error('timed out after 600s')), 600000)),
        ]);
        const file = path.join(OUTDIR, `${name}.png`);
        await writeFile(file, Buffer.from(png.split(',')[1], 'base64'));
        report.frames[name] = { file: path.relative(ROOT, file), ms: Date.now() - t0 };
        process.stdout.write(`  ✓ ${name.padEnd(10)} ${String(Date.now() - t0).padStart(6)}ms\n`);
      } catch (err) {
        report.errors.push(`${name}: ${err.message}`);
        process.stdout.write(`  ✗ ${name}: ${err.message.split('\n')[0]}\n`);
      }
      await writeFile(path.join(OUTDIR, 'report.json'), JSON.stringify(report, null, 2)).catch(() => {});
    }
    report.consoleErrors = consoleErrors.slice(0, 20);
  } finally {
    await browser.close().catch(() => {});
    server.kill('SIGTERM');
    setTimeout(() => server.kill('SIGKILL'), 3000);
    await writeFile(path.join(OUTDIR, 'report.json'), JSON.stringify(report, null, 2)).catch(() => {});
  }
  process.stdout.write(`\n→ ${path.relative(ROOT, OUTDIR)}/  (${Object.keys(report.frames).length} frames)\n`);
  process.exit(0);
}

main().catch((e) => { console.error('ventshot failed:', e.message); process.exit(1); });

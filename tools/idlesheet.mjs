#!/usr/bin/env node
/**
 * idlesheet.mjs — the contact sheet. Every static pose the reference corpus holds, rendered on
 * the shipped rig, front and profile, in both readings, labelled with the clip's REAL name.
 *
 * §479.19. Four rounds have chosen a target for the standing pose and been rejected four times,
 * every one of them measuring clean before the user looked. This deliverable is deliberately
 * NOT a measurement: it puts the judgement where it belongs by showing the options and letting
 * the user point at the one they mean.
 *
 * Poses come from `tools/idlecensus.mjs` (`shots/idle19/candidates.json`), which finds them by
 * CONTENT across all four Sly glTFs rather than by name. Each is injected through the REAL
 * `compile()` → `animation.play()` seam with the movement module parked — the §479 pose-take
 * precedent: clip table, skinning, materials, renderer and camera are all the shipped ones, and
 * only the state machine that would immediately re-base the clip is stopped.
 *
 * TWO READINGS PER POSE, because §479.17 measured that they differ by ~19 cm of hand separation
 * and the user may be pointing at a look only one of them produces:
 *   raw       their clip retargeted straight — "port the clip"
 *   matched   the same clip with the rest-abduction delta removed per arm, so each hand lands
 *             at THEIR measured outboard distance
 *
 * Frames named `front` are guarded by §479.14's camDot (RIG3 faces +Z; cam·facing = cos(az)),
 * and every frame carries a LIVE hand measurement that is cross-checked against the census's
 * offline number — a silent disagreement there would mean the sheet is not showing what the
 * table says it shows, which is exactly how earlier rounds went wrong.
 *
 *   node tools/idlesheet.mjs                    all poses
 *   ONLY=Standupright,UprightStand node …       just those
 */
import { chromium } from 'playwright';
import { acquire } from './lock.mjs';
import { spawn, execFileSync } from 'node:child_process';
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import net from 'node:net';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const OUT = process.env.OUT || `${ROOT}/shots/idle19`;
const W = Number(process.env.W || 620), H = Number(process.env.H || 820);
const ONLY = (process.env.ONLY || '').split(',').filter(Boolean);

async function freePort(start = 6200) {
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
const { sheet } = JSON.parse(await readFile(path.join(OUT, 'candidates.json'), 'utf8'));
const poses = ONLY.length ? sheet.filter((c) => ONLY.includes(c.name)) : sheet;
await mkdir(OUT, { recursive: true });
const release = await acquire('idlesheet');
console.log(`[sheet] lock · sha ${sha} · ${poses.length} poses × 2 readings × 2 views`);

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
    window.__SKIPMOVE = true;
    window.__simStep = (n, dt) => {
      for (let i = 0; i < n; i++) {
        e.input?.beginFrame?.();
        e.dt = Math.min(dt, 1 / 20) * e.timeScale;
        if (e.debug.paused || e.paused) e.dt = 0;
        e.time += e.dt; e.frame++;
        for (const { key, mod } of e._ordered) {
          if (window.__SKIPMOVE && key === 'movement') continue;
          if (typeof mod.update === 'function') { try { mod.update(e.dt, e.time); } catch {} }
        }
      }
    };
    /* the live reading, in the pose's own shoulder-line frame — _posecarry's numbers */
    window.__handProbe = () => {
      const ch = e.get('character'); const B = ch?.bones || {};
      const wp = (b) => { b.updateWorldMatrix(true, false); const m = b.matrixWorld.elements; return { x: m[12], y: m[13], z: m[14] }; };
      const ua = wp(B.upperArmL), ub = wp(B.upperArmR);
      let lx = ua.x - ub.x, lz = ua.z - ub.z;
      const n = Math.hypot(lx, lz) || 1; lx /= n; lz /= n;
      const dot = (p, q) => (p.x - q.x) * lx + (p.z - q.z) * lz;
      const hl = wp(B.handL), hr = wp(B.handR);
      return { sepCm: +(dot(hl, hr) * 100).toFixed(1), outL: +(dot(hl, ua) * 100).toFixed(1), outR: +(-dot(hr, ub) * 100).toFixed(1) };
    };
  });
  const sim = (n = 1) => page.evaluate((k) => window.__simStep(k, 1 / 60), n);

  const snap = async (name, az) => {
    const tel = await page.evaluate(([azDeg]) => {
      const e = window.__ENGINE, m = e.get('movement');
      const a2 = (m.yaw ?? 0) + (azDeg * Math.PI / 180);
      e.debug.freeCam = true;
      e.camera.position.set(m.position.x + Math.sin(a2) * 2.55, m.position.y + 1.05, m.position.z + Math.cos(a2) * 2.55);
      e.camera.lookAt(m.position.x, m.position.y + 0.92, m.position.z);
      e.camera.updateMatrixWorld(true);
      const camDot = Math.cos(azDeg * Math.PI / 180);
      return { az: azDeg, camDot: +camDot.toFixed(2), view: camDot > 0.3 ? 'front' : camDot < -0.3 ? 'REAR' : 'profile', ...window.__handProbe() };
    }, [az]);
    const uri = await page.evaluate(() => window.__GAME.capture('image/png'));
    await page.evaluate(() => { window.__ENGINE.debug.freeCam = false; });
    await writeFile(`${OUT}/${name}.png`, Buffer.from(uri.split(',')[1], 'base64'));
    if (/front/.test(name) && tel.view !== 'front') {
      throw new Error(`idlesheet: "${name}" was shot from ${tel.view} (cam·facing ${tel.camDot}) — §479.14`);
    }
    log.push({ frame: name, ...tel });
    return tel;
  };

  await sim(40);
  await page.evaluate(() => { const m = window.__ENGINE.get('movement'); m.position.set(0, 0, 30); m.velocity.set(0, 0, 0); });
  await sim(90);

  /* Slug must be COLLISION-PROOF, not merely tidy: three differently-named crouch clips slug to
     the same string, and the first run silently overwrote 24 of 72 frames because of it. The
     file tag makes every tile's filename unique even when the census's dedupe lets two through. */
  const slug = (c) => `${c.name.toLowerCase().replace(/[^a-z0-9]+/g, '').slice(0, 20)}`
    + `-${(c.file.match(/Anims(\d+)/) || [, 'x'])[1]}`;
  for (const c of poses) {
    for (const reading of ['raw', 'matched']) {
      const ok = await page.evaluate(async (rawPose) => {
        const A = await import('/src/player/Animation.js');
        const C = await import('/src/player/Clips.js');
        A.ACTIVE.__sheet = C.compile('__sheet', rawPose);
        window.__ENGINE.get('animation').play('__sheet', { fade: 0, loop: true, speed: 1 });
        return true;
      }, c[reading].pose);
      if (!ok) throw new Error(`idlesheet: inject failed for ${c.name}/${reading}`);
      await sim(24);                                   /* let the springs and IK settle */
      const tag = `${slug(c)}-${reading}`;
      const f = await snap(`pose-${tag}-front34`, 35);
      await snap(`pose-${tag}-profile`, 90);
      /* cross-check the live reading against the census's offline number (§435.4) */
      const want = c[reading].sepCm;
      const drift = Math.abs(f.sepCm - want);
      console.log(`  ${c.name.padEnd(20)} ${reading.padEnd(8)} live sep ${String(f.sepCm).padStart(6)} cm  (census ${String(want).padStart(6)}, Δ ${drift.toFixed(1)})${drift > 6 ? '   << DRIFT' : ''}`);
    }
  }
} finally {
  await writeFile(`${OUT}/telemetry-sheet.json`, JSON.stringify({ sha, W, H, errs, log }, null, 2));
  await browser.close().catch(() => {});
  server.kill('SIGTERM');
  await release();
  console.log(`[sheet] done · ${log.length} frames · errs ${errs.length}`);
  if (errs.length) console.log(errs.slice(0, 6).join('\n'));
}

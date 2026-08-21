#!/usr/bin/env node
/**
 * seamlook.mjs — photograph the CROSSFADES the moveset actually drives between a swapped godot
 * clip and its procedural blend partner, mid-fade, on the shipped model.
 *
 * §479.5: the user reads "arms crossed on a ledge / off balance". The pure poses were audited
 * (§479, moves1-*) and pass; the defect lives in the SEAM — the proc partners (ledge_shimmy_l/r,
 * balance_idle) authored wrists past the midline (HANG-family sign defect), so every fade to or
 * from the uncrossed godot clip swept both hands THROUGH the body midline in opposite
 * directions. This tool drives the real `animation.play()` crossfade at the moveset's own fade
 * times (hang↔shimmy 0.14/0.16 s, rail_walk↔balance_idle 0.2 s) and captures the mid-fade
 * beats, rear view (the player's) plus one front-quarter at the worst beat. Telemetry records
 * live hand lateral separation (shoulder-line frame) per capture, so "crossed" is a number on
 * the frame, not a squint.
 *
 * Run:  node tools/seamlook.mjs                      (current tree — the after arm)
 *       TAG=before node tools/seamlook.mjs           (with Clips.js stashed to HEAD — before)
 */
import { chromium } from 'playwright';
import { acquire } from './lock.mjs';
import { spawn, execFileSync } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import net from 'node:net';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const OUT = process.env.OUT || `${ROOT}/shots/seam1`;
const W = Number(process.env.W || 1600), H = Number(process.env.H || 900);
const TAG = process.env.TAG || 'after';

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
const dirty = execFileSync('git', ['status', '--porcelain', '--', 'src/'], { cwd: ROOT, encoding: 'utf8' }).trim();

await mkdir(OUT, { recursive: true });
const release = await acquire('seamlook');
console.log(`[seam] lock · sha ${sha}${dirty ? ' · DIRTY (expected for the after arm)' : ' · clean'} · arm ${TAG}`);

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
    window.__SKIPMOVE = true;                       // park the state machine, keep the pipeline
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
    /* live hand telemetry, shoulder-line frame — the same metric as tools/armcross.mjs */
    window.__hands = () => {
      const ch = e.get('character'), a = e.get('animation');
      const B = ch?.bones || {};
      const wp = (b) => { b.updateWorldMatrix(true, false); const el = b.matrixWorld.elements; return { x: el[12], y: el[13], z: el[14] }; };
      const ua = wp(B.upperArmL), ub = wp(B.upperArmR), hip = wp(B.hips);
      let lx = ua.x - ub.x, lz = ua.z - ub.z;
      const n = Math.hypot(lx, lz) || 1; lx /= n; lz /= n;
      const lat = (p) => +(((p.x - hip.x) * lx + (p.z - hip.z) * lz) / 0.28).toFixed(2);
      const hl = wp(B.handL), hr = wp(B.handR);
      return {
        latL: lat(hl), latR: lat(hr), sep: +(lat(hl) - lat(hr)).toFixed(2),
        tracks: (a?.tracks || []).filter((t) => t.clip && t.w > 0.01).map((t) => `${t.clip.name}:${t.w.toFixed(2)}`),
      };
    };
  });
  const sim = (n = 1) => page.evaluate((k) => window.__simStep(k, 1 / 60), n);
  const play = (n, fade) => page.evaluate(([nm, fd]) => {
    const a = window.__ENGINE.get('animation');
    const m = a.constructor;                            // ACTIVE lives module-side; loop from table
    a.play(nm, { fade: fd });
  }, [n, fade]);
  const snap = async (name, az = 35, dist = 2.6, h = 1.2) => {
    const tel = await page.evaluate(([azDeg, d, hh]) => {
      const e = window.__ENGINE, m = e.get('movement');
      const t = window.__hands();
      const yaw = m.yaw ?? 0;
      const a2 = yaw + (azDeg * Math.PI / 180);
      e.debug.freeCam = true;
      e.camera.position.set(m.position.x + Math.sin(a2) * d, m.position.y + hh, m.position.z + Math.cos(a2) * d);
      e.camera.lookAt(m.position.x, m.position.y + 1.05, m.position.z);
      e.camera.updateMatrixWorld(true);
      return t;
    }, [az, dist, h]);
    const uri = await page.evaluate(() => window.__GAME.capture('image/png'));
    await page.evaluate(() => { window.__ENGINE.debug.freeCam = false; });
    await writeFile(`${OUT}/${TAG}-${name}.png`, Buffer.from(uri.split(',')[1], 'base64'));
    log.push({ frame: `${TAG}-${name}`, az, ...tel });
    console.log(`  -> ${TAG}-${name}.png  sep ${tel.sep}  [${tel.tracks.join(' ')}]`);
    return tel;
  };

  await sim(40);
  await page.evaluate(() => { const m = window.__ENGINE.get('movement'); m.position.set(0, 0, 30); m.velocity.set(0, 0, 0); });
  await sim(30);

  /* ---- seam 1: ledge_hang ↔ ledge_shimmy_r (the moveset's 0.14 s fade) -------------------- */
  await play('ledge_hang', 0.06); await sim(30);
  await snap('ledge-hang-rear', 35);
  await play('ledge_shimmy_r', 0.14);
  await sim(2); await snap('ledge-fade-f2-rear', 35);
  await sim(3); await snap('ledge-fade-f5-rear', 35);
  await snap('ledge-fade-f5-front', 155, 2.4);
  await sim(3); await snap('ledge-fade-f8-rear', 35);
  await sim(30); await snap('ledge-shimmy-rear', 35);
  /* and the return fade (0.16 s), second sample of the same claim */
  await play('ledge_hang', 0.16);
  await sim(5); await snap('ledge-return-f5-rear', 35);

  /* ---- seam 2: rail_walk ↔ balance_idle (the moveset's 0.2 s fade) ------------------------ */
  await play('rail_walk', 0.06); await sim(30);
  await snap('rail-walk-rear', 35);
  await play('balance_idle', 0.2);
  await sim(3); await snap('rail-fade-f3-rear', 35);
  await sim(3); await snap('rail-fade-f6-rear', 35);
  await snap('rail-fade-f6-front', 155, 2.4);
  await sim(3); await snap('rail-fade-f9-rear', 35);
  await sim(35); await snap('rail-balance-rear', 35);
  await snap('rail-balance-front', 155, 2.4);
} finally {
  await writeFile(`${OUT}/telemetry-${TAG}.json`, JSON.stringify({ sha, dirty, W, H, TAG, errs, log }, null, 2));
  await browser.close().catch(() => {});
  server.kill('SIGTERM');
  await release();
  console.log(`[seam] done · ${log.length} frames · errs ${errs.length}`);
  if (errs.length) console.log(errs.slice(0, 6).join('\n'));
}

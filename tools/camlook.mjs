#!/usr/bin/env node
/**
 * camlook.mjs — photograph what the CAMERA RIG does, as opposed to what a staged shot looks like.
 *
 * `tools/shot.mjs` is the right tool for judging pixels and the wrong one for judging the camera,
 * and not by accident: `setShot` sets `engine.debug.freeCam = true` and writes
 * `cam.position`/`cam.lookAt` by hand, so **every canonical frame in `shots/` was composed with the
 * CameraRig switched off.** That is correct for a lighting or shading critic — a fixed camera is
 * what makes two frames comparable — and it means the entire screenshot corpus of this project
 * contains no evidence about boom length, framing blends, lead, bank or occlusion recovery.
 *
 * This harness leaves the rig in charge. The Controller owns the player, input arrives as real
 * key and mouse events, frames are taken away from rAF via `engine.stopLoop()` so the sim advances
 * at a fixed 1/60 dt, and `__GAME.capture()` reads the framebuffer. Per-frame telemetry
 * (`stateName`, `_frameKey`, `boom`, `fov`, `_roll`) is written next to the PNGs so a frame can be
 * tied to the framing that produced it — a picture of a camera is not self-describing.
 *
 *   node tools/camlook.mjs                 default 960x540, quality high
 *   W=1280 H=720 Q=ultra node tools/camlook.mjs
 *
 * Cost, measured on this container's software rasteriser: a frame is seconds, so a fifty-frame
 * run-up is minutes. Takes the same FIFO capture lock as `shot.mjs`; keep runs short.
 *
 * The sequences exist to answer specific questions and should be edited freely:
 *   S1  run, jump, land        — the `land` framing, which went 6% -> 52% delivered
 *   S2  slam from a hop        — a jump-apex Cane Slam
 *   S3  slam from height       — the same move from a real drop; S2 and S3 side by side are
 *                                sheet item 3, the two visual identities that may have merged
 *   S4  cane combo             — the `combat` framing, 35% -> 73%
 */
import { chromium } from 'playwright';
import { acquire } from './lock.mjs';
import { spawn, execFileSync } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import net from 'node:net';

import path from 'node:path';
const ROOT = path.resolve(import.meta.dirname, '..');
const OUT = process.env.OUT || `${ROOT}/shots/camlane`;
const W = Number(process.env.W || 960), H = Number(process.env.H || 540);
const Q = process.env.Q || 'high';

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
const dirty = execFileSync('git', ['status', '--porcelain', '--', 'src/', 'index.html', 'vite.config.js'],
  { cwd: ROOT, encoding: 'utf8' }).trim();

await mkdir(OUT, { recursive: true });
const release = await acquire('look2-camlane');
console.log(`[look] lock · sha ${sha}${dirty ? ` · DIRTY\n${dirty}` : ' · clean'}`);

const port = await freePort();
const server = await startServer(port);
const CHROME = process.env.CHROME_PATH
  || ['/opt/pw-browsers/chromium', '/usr/bin/chromium'].find((p) => existsSync(p));
const browser = await chromium.launch({
  executablePath: CHROME,
  args: ['--no-sandbox', '--disable-dev-shm-usage', '--use-gl=angle', '--use-angle=swiftshader',
    '--enable-unsafe-swiftshader', '--enable-webgl', '--ignore-gpu-blocklist',
    '--disable-frame-rate-limit', '--js-flags=--max-old-space-size=4096',
    '--force-device-scale-factor=1', '--hide-scrollbars', '--mute-audio'],
});
const ctx = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
const page = await ctx.newPage();
const errs = [];
page.on('pageerror', (e) => errs.push(`pageerror: ${e.message}`));
page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });

const log = [];
try {
  await page.goto(`http://127.0.0.1:${port}/?shot=1&q=${Q}`, { waitUntil: 'domcontentloaded', timeout: 120000 });
  await page.waitForFunction('window.__GAME && window.__GAME.ready === true', null, { timeout: 600000, polling: 500 });
  console.log('[look] ready');
  await page.evaluate(() => {
    window.__ENGINE.stopLoop();            // frames come from step(), not rAF
    window.__GAME.hideHud(true);
    window.__ENGINE.debug.freeCam = false; // the rig keeps the camera
  });

  const probe = () => page.evaluate(() => {
    const e = window.__ENGINE, m = e.get('movement'), c = e.get('camera');
    return {
      st: m?.stateName, gr: !!m?.grounded,
      p: [+m.position.x.toFixed(2), +m.position.y.toFixed(2), +m.position.z.toFixed(2)],
      v: [+m.velocity.x.toFixed(2), +m.velocity.y.toFixed(2), +m.velocity.z.toFixed(2)],
      key: c?._frameKey, boom: +(c?.boom ?? 0).toFixed(3), fov: +(e.camera.fov).toFixed(2),
      roll: +(c?._roll ?? 0).toFixed(4),
    };
  });
  const step = (n = 1) => page.evaluate((k) => window.__GAME.step(k, 1 / 60), n);
  const shot = async (name) => {
    const uri = await page.evaluate(() => window.__GAME.capture('image/png'));
    await writeFile(`${OUT}/${name}.png`, Buffer.from(uri.split(',')[1], 'base64'));
    console.log(`      -> ${name}.png`);
  };
  const tp = (x, y, z, yaw = 0) => page.evaluate(([a, b, c, d]) => {
    const m = window.__ENGINE.get('movement');
    m.teleport(new (window.THREE || Object).Vector3 ? new window.THREE.Vector3(a, b, c) : { x: a, y: b, z: c }, d);
  }, [x, y, z, yaw]).catch(() => page.evaluate(([a, b, c, d]) => {
    const e = window.__ENGINE, m = e.get('movement');
    m.position.set(a, b, c); m.velocity.set(0, 0, 0); if ('yaw' in m) m.yaw = d;
  }, [x, y, z, yaw]));

  const t0 = Date.now();
  await step(10);
  console.log(`[look] 10 frames in ${((Date.now() - t0) / 1000).toFixed(1)}s  (${((Date.now() - t0) / 10000).toFixed(2)}s/frame)`);
  const home = await probe();
  console.log(`[look] spawn ${JSON.stringify(home)}`);
  log.push({ tag: 'spawn', ...home });
  await shot('01-spawn-idle');

  /* ---- S1: run, jump, land ------------------------------------------------ */
  console.log('[S1] run + jump + land');
  await page.keyboard.down('KeyW');
  await step(50);
  const running = await probe(); log.push({ tag: 'S1-running', ...running });
  console.log(`     running ${JSON.stringify(running)}`);
  await shot('02-run');
  await page.keyboard.down('Space'); await step(3); await page.keyboard.up('Space');
  let landed = null;
  for (let i = 0; i < 90; i++) {
    await step(1);
    const s = await probe();
    if (s.st === 'land') { landed = { i, ...s }; break; }
    if (i === 8) await shot('03-air-apex');
  }
  console.log(`     land at +${landed?.i} ${JSON.stringify(landed)}`);
  log.push({ tag: 'S1-land', ...landed });
  await shot('04-land');
  await step(6); await shot('05-land+6');
  await page.keyboard.up('KeyW');
  await step(20);

  /* ---- S2: Cane Slam from a hop ------------------------------------------ */
  console.log('[S2] cane slam from a jump apex');
  await tp(home.p[0], home.p[1], home.p[2], 0);
  await step(20);
  await page.keyboard.down('KeyW'); await step(40);
  await page.keyboard.down('Space'); await step(3); await page.keyboard.up('Space');
  await step(11);                                  // near apex
  const apex = await probe(); log.push({ tag: 'S2-apex', ...apex });
  console.log(`     apex ${JSON.stringify(apex)}`);
  await page.mouse.down({ button: 'left' }); await step(2); await page.mouse.up({ button: 'left' });
  let hit = null;
  for (let i = 0; i < 60; i++) {
    await step(1);
    const s = await probe();
    if (s.st !== 'dive' && s.gr) { hit = { i, ...s }; break; }
  }
  console.log(`     impact +${hit?.i} ${JSON.stringify(hit)}`);
  log.push({ tag: 'S2-impact', ...hit });
  await shot('06-slam-hop-impact');
  await page.keyboard.up('KeyW');
  await step(20);

  /* ---- S3: Cane Slam from height ----------------------------------------- */
  console.log('[S3] cane slam from height');
  await tp(home.p[0], home.p[1] + 16, home.p[2], 0);
  await step(2);
  const dropStart = await probe(); log.push({ tag: 'S3-drop', ...dropStart });
  console.log(`     dropping from ${JSON.stringify(dropStart.p)}`);
  await step(14);
  await page.mouse.down({ button: 'left' }); await step(2); await page.mouse.up({ button: 'left' });
  let hit2 = null;
  for (let i = 0; i < 90; i++) {
    await step(1);
    const s = await probe();
    if (s.st !== 'dive' && s.gr) { hit2 = { i, ...s }; break; }
  }
  console.log(`     impact +${hit2?.i} ${JSON.stringify(hit2)}`);
  log.push({ tag: 'S3-impact', ...hit2 });
  await shot('07-slam-high-impact');
  await step(20);

  /* ---- S4: combat swing --------------------------------------------------- */
  console.log('[S4] cane combo on the ground');
  await tp(home.p[0], home.p[1], home.p[2], 0);
  await step(20);
  await page.mouse.down({ button: 'left' }); await step(2); await page.mouse.up({ button: 'left' });
  await step(6);
  const combo = await probe(); log.push({ tag: 'S4-combo', ...combo });
  console.log(`     combo ${JSON.stringify(combo)}`);
  await shot('08-combo');
} finally {
  await writeFile(`${OUT}/telemetry.json`, JSON.stringify({ sha, dirty, W, H, Q, errs, log }, null, 2));
  await browser.close();
  server.kill('SIGTERM');
  release();
  console.log('[look] released');
  if (errs.length) console.log(`[look] page errors:\n${errs.slice(0, 8).join('\n')}`);
}

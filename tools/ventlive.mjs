#!/usr/bin/env node
/**
 * ventlive.mjs — try to get into the vent in a REAL BROWSER, with real held keys (§602).
 *
 * Every arm in `ventroute.test.mjs` is green and the player reports the crawl space is still not
 * accessible. Those arms run in `tests/_moveset.mjs`'s `realWorld()`, which builds the level in
 * plain Node — no KayKit props, no terrain streaming, no rAF, no `src/core/Input.js`. This boots
 * the shipped build in Chromium and drives the player the way a person does:
 *
 *   · real `KeyboardEvent`s (Playwright `keyboard.down('KeyW')`), so `Input.js` is in the path
 *   · the real module graph, so KAYKIT's props and their colliders exist
 *   · `engine.stopLoop()` + `__GAME.step(1, 1/60)` so the drive is deterministic rather than
 *     racing SwiftShader's frame rate. dt is clamped to 1/20 in `renderFrame` anyway, so this
 *     changes the speed of the experiment and not its physics.
 *
 * The camera yaw is written directly each step (`rig.yaw`) because look is mouse-or-pad only and
 * pointer lock is not grantable here. That is the one part of the input path this does not
 * exercise, and it is stated rather than hidden.
 */
import { chromium } from 'playwright';
import { acquire } from './lock.mjs';
import { spawn } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import net from 'node:net';

const ROOT = path.resolve(import.meta.dirname, '..');
const OUTDIR = path.join(ROOT, process.env.OUT || 'shots/vent');
const WANT_SHOTS = process.argv.includes('--shots');

/* The drive: start, then waypoints. Same chain `ventroute` R1 uses, so a difference between this
   and R1 is a difference between the browser and `realWorld()`, not between two routes.
 *
 * `NX=<x>` switches to the PLAYER model instead: start at that x and hold forward due NORTH, with
 * no waypoint steering into the bore. That is what `_north.mjs` measured headlessly — the mouth
 * admits x -22.7..-21.4 but `inVent()` fires out to x -20.7, so there is 0.70 m of wall where the
 * game drops Sly into `crawl` and then stops him at z -49.56. NX is how that gets confirmed in a
 * browser rather than argued from a Node harness.
 *
 * Camera yaw 0 faces -z. `hardReset`'s PLAYER yaw for the same heading is PI — the two conventions
 * are opposite, and feeding the camera PI sends the walker south. */
const NX = process.env.NX ? +process.env.NX : null;
const START = NX === null ? [-21.85, 0.20, -46.0] : [NX, 0.20, -47.6];
const WAY = NX === null
  ? [[-21.85, -52], [-21.85, -60], [-18.0, -63.0], [-11.4, -63.0]]
  : [[NX, -80]];                       // due north, far past the wall: never "arrives"

/* Player-eye frames along the natural approach, for the discoverability question. */
const EYES = [
  ['eye-10m', [-21.85, 0.20, -40.0]],
  ['eye-4m', [-21.85, 0.20, -46.0]],
  ['eye-lip', [-21.85, 0.20, -48.4]],
];

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
  const out = { at: new Date().toISOString(), errors: [] };
  try {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
    const page = await ctx.newPage();
    const errs = [];
    page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
    page.on('pageerror', (e) => errs.push(`pageerror: ${e.message}`));
    process.stdout.write('· loading game\n');
    await page.goto(`http://127.0.0.1:${port}/?q=high`, { waitUntil: 'domcontentloaded', timeout: 90000 });
    await page.waitForFunction('window.__GAME && window.__GAME.ready === true', null, { timeout: 600000, polling: 500 });
    process.stdout.write('· ready\n');

    /* ── what the browser actually built, against what `realWorld()` builds ── */
    out.world = await page.evaluate(() => {
      const g = window.__GAME, e = g.engine;
      e.stopLoop();
      const col = e.get('collision');
      const recs = col?.records || col?._records || col?.colliders || null;
      const byTag = {};
      if (recs) for (const r of recs) { const t = r.tag || r.opts?.tag || '?'; byTag[t] = (byTag[t] || 0) + 1; }
      return {
        modules: g.modules(),
        colliderCount: recs ? recs.length : null,
        byTag,
        kaykit: (() => { const k = e.get('props') || e.get('kaykit'); return k?.stats || null; })(),
      };
    });
    process.stdout.write(`· modules: ${Object.entries(out.world.modules).filter(([, v]) => v).map(([k]) => k).join(' ')}\n`);
    process.stdout.write(`· colliders in browser: ${out.world.colliderCount}\n`);
    process.stdout.write(`· by tag: ${JSON.stringify(out.world.byTag)}\n`);

    /* ── the drive, with a real held key ── */
    await page.evaluate((s) => {
      const mv = window.__GAME.engine.get('movement');
      mv.position.set(s[0], s[1], s[2]);
      mv.velocity?.set?.(0, 0, 0);
    }, START);
    /* Settle the capsule the same non-rendering way — a teleported probe is not a settled one
       (§435.4), and 40 rendered frames here cost two minutes for nothing. */
    await page.evaluate(() => {
      const e = window.__GAME.engine, mv = e.get('movement'), DT = 1 / 60;
      for (let i = 0; i < 40; i++) { e.input.beginFrame(DT); e.time += DT; mv.update(DT, e.time); e.input.endFrame?.(); }
    });

    await page.bringToFront();
    await page.keyboard.down('KeyW');
    process.stdout.write('· KeyW held (real keydown)\n');

    /* Driven in CHUNKS. Each `step()` renders a full software frame, so a 2600-frame drive is
       tens of minutes of SwiftShader; returning only at the end means a timeout loses the whole
       trace. Chunking prints as it goes and keeps whatever it reached. */
    await page.evaluate(() => {
      const g = window.__GAME, e = g.engine;
      const mv = e.get('movement'), rig = e.get('camera');
      window.__V = {
        wp: 0, sawCrawl: false, minZ: mv.position.z, log: [], i: 0,
        firstMoveY: [], anyForward: false, mv, rig,
      };
    });

    /* Driven WITHOUT rendering. `__GAME.step()` renders a full software frame — measured here at
       seconds per frame, so a 1000-frame drive does not finish inside any sane timeout, and the
       first attempt produced no trace at all. `input.beginFrame(dt)` is what samples the real
       held keys and writes `input.move` (Input.js:1061→1117), and `movement.update(dt, t)` is the
       whole of the physics. Pumping those two directly keeps everything this experiment is about
       — the browser's own level build, its collision BVH with props in it, the real `Input.js`
       holding a real `KeyboardEvent` — and drops only the pixels, the camera rig and the other
       modules, none of which decide whether a capsule fits through a hole. Stated, not hidden. */
    const CHUNK = 300, MAX = +(process.env.FRAMES || 1200);
    let done = false;
    for (let base = 0; base < MAX && !done; base += CHUNK) {
      const part = await page.evaluate(async (a) => {
        const g = window.__GAME, e = g.engine;
        const S = window.__V, mv = S.mv, rig = S.rig;
        const DT = 1 / 60;
        for (let k = 0; k < a.chunk; k++) {
          const t = a.way[Math.min(S.wp, a.way.length - 1)];
          const dx = t[0] - mv.position.x, dz = t[1] - mv.position.z;
          const yaw = Math.atan2(-dx, -dz);
          if (rig) rig.yaw = yaw;
          e.camera.rotation.set(0, yaw, 0, 'YXZ');
          e.camera.updateMatrixWorld(true);
          e.input.beginFrame(DT);
          e.time += DT;
          mv.update(DT, e.time);
          e.input.endFrame?.();
          if (S.i < 6) S.firstMoveY.push(+(e.input?.move?.y ?? -99).toFixed(2));
          if ((e.input?.move?.y ?? 0) > 0.1) S.anyForward = true;
          if (mv.stateName === 'crawl') S.sawCrawl = true;
          if (mv.position.z < S.minZ) S.minZ = mv.position.z;
          S.i++;
          const d = Math.hypot(mv.position.x - t[0], mv.position.z - t[1]);
          if (d < 1.1 && S.wp < a.way.length - 1) S.wp++;
          else if (S.wp === a.way.length - 1 && d < 1.1) return { arrived: true, ...snap() };
        }
        function snap() {
          return {
            i: S.i, x: +mv.position.x.toFixed(2), y: +mv.position.y.toFixed(2), z: +mv.position.z.toFixed(2),
            st: mv.stateName, grounded: !!mv.grounded, tag: mv.groundTag, wp: S.wp,
            sawCrawl: S.sawCrawl, minZ: +S.minZ.toFixed(2),
            firstMoveY: S.firstMoveY, anyForward: S.anyForward,
            inVent: typeof mv.inVent === 'function' ? mv.inVent() : null,
          };
        }
        return { arrived: false, ...snap() };
      }, { chunk: CHUNK, way: WAY });
      process.stdout.write(`    f${String(part.i).padStart(5)}  (${String(part.x).padStart(7)}, `
        + `${String(part.y).padStart(6)}, ${String(part.z).padStart(7)})  ${String(part.st).padEnd(7)} `
        + `wp${part.wp} grounded ${part.grounded ? 'y' : '.'} ground=${part.tag} crawl=${part.sawCrawl ? 'y' : '.'} `
        + `inVent=${part.inVent}\n`);
      out.drive = part;
      if (part.arrived) done = true;
    }
    const trace = out.drive;
    await page.keyboard.up('KeyW');

    process.stdout.write(`\n· input reaching the sim, first frames move.y = [${trace.firstMoveY.join(', ')}] `
      + `(any forward: ${trace.anyForward})\n`);
    process.stdout.write(`· RESULT crawl=${trace.sawCrawl} minZ=${trace.minZ} end=(${trace.x}, ${trace.y}, `
      + `${trace.z}) state=${trace.st} inVent=${trace.inVent}\n`);
    const through = trace.x > -12.5 && trace.z < -60;
    process.stdout.write(`· THROUGH TO THE CRYPT: ${through ? 'YES' : 'NO'}\n`);
    out.through = through;

    /* ── player-eye frames, same boot ── */
    if (WANT_SHOTS) {
      for (const [name, pos] of EYES) {
        try {
          const png = await page.evaluate(async (a) => {
            const g = window.__GAME, e = g.engine;
            const mv = e.get('movement'), rig = e.get('camera');
            mv.position.set(a.pos[0], a.pos[1], a.pos[2]);
            mv.velocity?.set?.(0, 0, 0);
            if (rig) rig.yaw = Math.PI;               // face north, down the hall's west aisle
            await g.step(30, 1 / 60);
            g.hideHud(true);
            await g.step(4, 1 / 60);
            return g.capture();
          }, { pos });
          await writeFile(path.join(OUTDIR, `${name}.png`), Buffer.from(png.split(',')[1], 'base64'));
          process.stdout.write(`  ✓ ${name}\n`);
        } catch (err) { out.errors.push(`${name}: ${err.message}`); process.stdout.write(`  ✗ ${name}: ${err.message}\n`); }
      }
    }
    out.consoleErrors = errs.slice(0, 20);
    if (errs.length) process.stdout.write(`\n· console errors (${errs.length}): ${errs.slice(0, 5).join(' | ')}\n`);
  } finally {
    await browser.close().catch(() => {});
    server.kill('SIGTERM');
    setTimeout(() => server.kill('SIGKILL'), 3000);
    await writeFile(path.join(OUTDIR, 'live.json'), JSON.stringify(out, null, 2)).catch(() => {});
  }
  process.exit(0);
}

main().catch((e) => { console.error('ventlive failed:', e.message); process.exit(1); });

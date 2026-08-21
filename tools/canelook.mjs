#!/usr/bin/env node
/**
 * canelook.mjs — the §479.8 combat + pickpocket + hook port on camera, shipped model, one arm
 * per invocation so a pair differs by the regime token alone (the §474 attribution rule).
 *
 *   COMBAT, real drive: three KeyF presses at the combo's own chain cadence, frames at fixed
 *   sim offsets per swing with the active cane_combo track's playhead in the telemetry — the
 *   delivered strike moment is a number beside every frame.
 *   PICKPOCKET + HOOK, posed through the real `animation.play()` seam (movement parked): the
 *   §479 pose-take precedent — the state machine that would re-base is parked, the clip table,
 *   splice, donor fill, skinning and renderer are all shipped. In-situ steals and swings stay
 *   hardware-sheet material (item 19).
 *
 * Run:  node tools/canelook.mjs                (godot arm — shots/cane1/godot-*)
 *       AB=proc node tools/canelook.mjs        (procedural arm — shots/cane1/proc-*)
 *
 * RUN IT FROM A CLEAN WORKTREE AT COMMITTED HEAD, not the shared tree, whenever another lane
 * has uncommitted work in `src/`. This tool drives the attack through the real keyboard, so a
 * sibling's in-flight `src/core/Input.js` sits directly in the path between the press and the
 * clip — frames captured over it cannot be attributed to this lane's change. The banner prints
 * `DIRTY` when `src/` is not clean and the telemetry records it; treat that word as a stop sign
 * rather than a note. Setup that worked:
 *
 *     git worktree add --detach <wt> <sha>
 *     ln -s <repo>/node_modules <wt>/node_modules      # vite shares the dep cache
 *     cd <wt> && OUT=<repo>/shots/cane1 node tools/canelook.mjs
 *
 * Boot is slow under load — five minutes to `ready` on a contended four-core box is normal
 * here, and the stage markers below exist so that slowness is distinguishable from a hang.
 */
import { chromium } from 'playwright';
import { acquire } from './lock.mjs';
import { spawn, execFileSync } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import net from 'node:net';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const OUT = process.env.OUT || `${ROOT}/shots/cane1`;
const W = Number(process.env.W || 1600), H = Number(process.env.H || 900);
const AB = process.env.AB || '';
const ARM = AB || 'godot';

/* 6100, not 6000: Chromium refuses port 6000 outright (ERR_UNSAFE_PORT — it is X11's, and on its
   blocked list along with 6665-6669). Every other tool here sits in 5400-5900; this one needs its
   own lane so a parallel capture cannot collide, and 6100 is the next free one ABOVE the block. */
async function freePort(start = 6100) {
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
const release = await acquire('canelook');
console.log(`[cane] lock · sha ${sha}${dirty ? ' · DIRTY' : ' · clean'} · arm ${ARM}`);

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
  await page.goto(`http://127.0.0.1:${port}/?shot=1&q=high${AB ? `&anim=${AB}` : ''}`,
    { waitUntil: 'domcontentloaded', timeout: 120000 });
  await page.waitForFunction('window.__GAME && window.__GAME.ready === true', null, { timeout: 600000, polling: 500 });
  const regime = await page.evaluate(async () => (await import('/src/player/Animation.js')).CLIP_REGIME);
  console.log(`[cane] ready · CLIP_REGIME=${regime}`);
  await page.evaluate(() => {
    window.__ENGINE.stopLoop();
    window.__GAME.hideHud(true);
    window.__ENGINE.debug.freeCam = false;
    window.__ENGINE.input.locked = true;
    const e = window.__ENGINE;
    window.__SKIPMOVE = false;
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
  });
  /* Every await in this script is stage-marked. The first run of this tool sat silent for
     minutes between "ready" and the first frame with no way to tell simulation from a hung
     await, and a capture tool you cannot debug is a capture tool you cannot trust. `mark` is
     one line to stderr per stage; it costs nothing and turns "stuck" into "stuck HERE". */
  const t0 = Date.now();
  const mark = (s) => console.error(`  [${((Date.now() - t0) / 1000).toFixed(1)}s] ${s}`);
  const sim = async (n = 1) => {
    mark(`sim ${n}`);
    await page.evaluate((k) => window.__simStep(k, 1 / 60), n);
  };
  const snap = async (name, az = 145, dist = 2.7, h = 1.25) => {
    mark(`snap ${name} — telemetry`);
    const tel = await page.evaluate(([azDeg, d, hh]) => {
      const e = window.__ENGINE, m = e.get('movement'), a = e.get('animation');
      const yaw = m.yaw ?? 0;
      const a2 = yaw + (azDeg * Math.PI / 180);
      e.debug.freeCam = true;
      e.camera.position.set(m.position.x + Math.sin(a2) * d, m.position.y + hh, m.position.z + Math.cos(a2) * d);
      e.camera.lookAt(m.position.x, m.position.y + 0.95, m.position.z);
      e.camera.updateMatrixWorld(true);
      return {
        st: m?.stateName, combo: m?.comboIndex ?? null,
        tr: (a?.tracks || []).filter((t) => t.clip && t.w > 0.01)
          .map((t) => ({ n: t.clip.name, w: +t.w.toFixed(2), t: +t.time.toFixed(3) })),
      };
    }, [az, dist, h]);
    mark(`snap ${name} — capture`);
    const uri = await page.evaluate(() => window.__GAME.capture('image/png'));
    await page.evaluate(() => { window.__ENGINE.debug.freeCam = false; });
    await writeFile(`${OUT}/${ARM}-${name}.png`, Buffer.from(uri.split(',')[1], 'base64'));
    log.push({ frame: `${ARM}-${name}`, ...tel });
    const c = tel.tr.find((x) => x.n.startsWith('cane_combo')) || tel.tr.find((x) => x.n === 'pickpocket' || x.n.startsWith('hook'));
    console.log(`  -> ${ARM}-${name}.png  ${c ? `${c.n} t=${c.t} w=${c.w}` : tel.st}`);
  };

  /* SETTLE is the two settle windows, jumplook's 30/30 rounded up. It is env-tunable ONLY so a
     saturated box can still produce frames — the post-teleport settle streams the world in and
     on a contended four-core container that one call has been measured taking minutes, against
     six seconds for the identical call before the teleport. The default is the honest one; a
     smaller SETTLE trades pose settling for wall time and is a capture-cost knob, never a
     result knob (nothing sampled below reads from it). */
  const SETTLE = Number(process.env.SETTLE || 40);
  await sim(SETTLE);
  await page.evaluate(() => { const m = window.__ENGINE.get('movement'); m.position.set(0, 0, 30); m.velocity.set(0, 0, 0); });
  await sim(SETTLE);

  /* ---- combat: three presses at the chain cadence -------------------------------------------
     Frames BRACKET the measured contact rather than sampling round numbers: §479.8 puts the
     swing's contact at t 0.10 of Canehit (max forward reach, calibrated against our own proc
     set), i.e. press+6 at 60 Hz. So f3 is the windup, f6 IS the contact, f12 the follow-through.
     The same three offsets are used for the proc arm, where the house's own `cane_hit` sits at
     0.15/0.13/0.21 (f9/f8/f13) — deliberately NOT re-pinned per arm, because a pair that moves
     its own sample points cannot be compared frame to frame. The playhead is in the telemetry
     beside every frame, so each arm's phase is readable without trusting the offsets. */
  for (let swing = 1; swing <= 3; swing++) {
    mark(`swing ${swing} — KeyF down`);
    await page.keyboard.down('KeyF');
    await sim(2);
    mark(`swing ${swing} — KeyF up`);
    await page.keyboard.up('KeyF');
    await sim(1); await snap(`combo${swing}-f3`);
    await sim(3); await snap(`combo${swing}-f6`);
    await sim(6); await snap(`combo${swing}-f12`);
    await sim(2);                     /* chain window opens at 0.55·0.28 ≈ f9; next press lands ~f14 */
  }
  await sim(60);

  /* ---- pickpocket + hook, posed through the real play() seam -------------------------------- */
  await page.evaluate(() => { window.__SKIPMOVE = true; });
  await sim(5);
  const posed = async (verb, times, az) => {
    await page.evaluate(async (n) => {
      const { ACTIVE } = await import('/src/player/Animation.js');
      window.__ENGINE.get('animation').play(n, { fade: 0.06, loop: ACTIVE[n].loop, speed: 1 });
    }, verb);
    let last = 0;
    for (const t of times) {
      await sim(Math.round((t - last) * 60));
      last = t;
      await snap(`${verb.replace(/_/g, '')}-t${String(Math.round(t * 100)).padStart(3, '0')}`, az);
    }
    await sim(30);
  };
  await posed('pickpocket', [0.15, 0.45, 0.85], 90);
  await posed('hook_grab', [0.15, 0.55], 90);
  await posed('hook_swing', [0.4, 1.05], 90);
} finally {
  await writeFile(`${OUT}/telemetry-${ARM}.json`, JSON.stringify({ sha, dirty, W, H, ARM, errs, log }, null, 2));
  await browser.close().catch(() => {});
  server.kill('SIGTERM');
  await release();
  console.log(`[cane] done · ${log.length} frames · errs ${errs.length}`);
  if (errs.length) console.log(errs.slice(0, 6).join('\n'));
}

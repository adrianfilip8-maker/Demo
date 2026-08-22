#!/usr/bin/env node
/**
 * spreadlook.mjs — the §531 spread ruling on camera. The user, from the live build: "The arms
 * and legs are too tucked in. They should be spread out more." This shoots the poses where the
 * tuck is most visible — a standing idle, a driven run, and a LOADED hang (limbs carrying the
 * body, which a standing pose cannot show) — with the limb lever at the repo-faithful zero and
 * at the shipped values, two samples per pose, phase-matched.
 *
 * One invocation is one arm, selected by the boot override alone (the §474 attribution rule):
 *   node tools/spreadlook.mjs               shipped LIMB_OPEN  -> shots/spread1/open-*
 *   FAITHFUL=1 node tools/spreadlook.mjs    elbow 0 / knee 0   -> shots/spread1/faithful-*
 *
 * §532 additions:
 *   ELBOW=/KNEE=  pin the lever explicitly, so the arm the USER has already ruled on can be
 *                 re-shot against the new one (0.45/0.35 was the §531 ship; the faithful zero
 *                 is not the comparison the second ruling is about). ARM= names the output.
 *   TAKES=cross   poses the clips §532.1 solved back onto their own sides, through the same
 *                 real play() seam as the hang, so the uncrossing has frames of its own.
 */
import { chromium } from 'playwright';
import { acquire } from './lock.mjs';
import { spawn, execFileSync } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import net from 'node:net';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const OUT = process.env.OUT || `${ROOT}/shots/spread1`;
const W = Number(process.env.W || 1600), H = Number(process.env.H || 900);
const FAITHFUL = !!process.env.FAITHFUL;
const ELBOW = process.env.ELBOW !== undefined ? Number(process.env.ELBOW) : null;
const KNEE = process.env.KNEE !== undefined ? Number(process.env.KNEE) : null;
const SETTLE = Number(process.env.SETTLE || 55);
const RESET_Z = Number(process.env.RESET_Z || 30);
const ARM = process.env.ARM || (FAITHFUL ? 'faithful' : ELBOW !== null ? `e${ELBOW}k${KNEE}` : 'open');
const TAKES = (process.env.TAKES || 'idle,run,hang').split(',');
const take = (k) => TAKES.includes(k);

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
const release = await acquire('spreadlook');
console.log(`[spread] lock · sha ${sha} · arm ${ARM}`);

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
  /* the faithful arm is the boot override; the open arm is simply the shipped constant */
  if (FAITHFUL) await page.addInitScript(() => { window.__LIMB_OPEN = { elbow: 0, knee: 0 }; });
  else if (ELBOW !== null) await page.addInitScript(([e, k]) => { window.__LIMB_OPEN = { elbow: e, knee: k }; }, [ELBOW, KNEE ?? ELBOW]);
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
  await sim(40);

  /* 1. IDLE — the most folded pose in the whole set (elbow 104 deg before the lever), and the
     one the player looks at while standing still. Two samples: profile and front three-quarter. */
  if (take('idle')) {
    await sim(90);
    await snap('idle-profile', 90);
    await snap('idle-front34', 145, 2.4);
  }

  /* 2. RUN — driven, phase-matched so both arms photograph the same beat of the cycle. */
  if (take('run')) {
    /* 0.75, not 1.0: at full sprint the plaza's straight run is spent before the phase seek
       lands and the take ends wall-adjacent with the body mid-leap — §479 recorded exactly this
       refusal for run_fast, and the first run of this tool reproduced it. 0.75 is the `run`
       node's own magnitude and it stays in open ground. */
    await page.evaluate(() => { window.__MOVEMAG = 0.75; });
    await sim(SETTLE);
    await atPhase(0.25); await snap('run-a-profile', 90);
    await atPhase(0.75); await snap('run-b-profile', 90);
    await page.evaluate(() => { window.__MOVEMAG = null; });
    await sim(40);
  }

  /* 3. LOADED HANG — limbs carrying the body, posed through the real play() seam with the
     state machine parked (the §479 pose-take precedent; an in-situ ledge is hardware's).
     The reset back to the plaza is load-bearing and was learned the §479.3 way: the first run
     of this tool parked the state machine wherever the RUN take had left him and staged the
     camera inside a stairwell — two frames of ceiling. Reset, settle grounded, THEN park. */
  if (take('hang')) {
  await page.evaluate(() => { window.__MOVEMAG = null; });
  await sim(20);
  await page.evaluate(() => {
    const m = window.__ENGINE.get('movement');
    m.position.set(0, 0, window.__RESETZ); m.velocity.set(0, 0, 0);
  });
  await sim(80);
  const grounded = await page.evaluate(() => !!window.__ENGINE.get('movement')?.grounded);
  console.log(`  [hang] staged at plaza · grounded=${grounded}`);
  await page.evaluate(() => { window.__SKIPMOVE = true; });
  await sim(5);
  await page.evaluate(async () => {
    const { ACTIVE } = await import('/src/player/Animation.js');
    window.__ENGINE.get('animation').play('ledge_hang', { fade: 0.06, loop: ACTIVE.ledge_hang.loop, speed: 1 });
  });
  await sim(40);
  await snap('hang-front34', 145, 2.4);
  await snap('hang-profile', 90);
  }

  /* 4. THE UNCROSSED CLIPS (§532.1). Posed through the same real play() seam, same staging
     discipline as the hang. These are the poses the user reported as "crossed in some
     animations": each one held its wrists past the body's midline, and the lever made it
     worse. Two framings each — the front three-quarter is the one that reads. */
  if (take('cross')) {
  await page.evaluate(() => { window.__MOVEMAG = null; window.__SKIPMOVE = false; });
  await sim(20);
  for (const verb of (process.env.CROSS_CLIPS || 'paraglide,wall_cling,pole_slide,ko').split(',')) {
    await page.evaluate(() => {
      const m = window.__ENGINE.get('movement');
      m.position.set(0, 0, window.__RESETZ); m.velocity.set(0, 0, 0);
    });
    await page.evaluate(() => { window.__SKIPMOVE = false; });
    await sim(70);
    const grounded = await page.evaluate(() => !!window.__ENGINE.get('movement')?.grounded);
    await page.evaluate(() => { window.__SKIPMOVE = true; });
    await sim(5);
    const ok = await page.evaluate(async (n) => {
      const { ACTIVE } = await import('/src/player/Animation.js');
      if (!ACTIVE[n]) return false;
      window.__ENGINE.get('animation').play(n, { fade: 0.06, loop: ACTIVE[n].loop, speed: 1 });
      return true;
    }, verb);
    if (!ok) { console.log(`  [cross] no such clip ${verb} — skipped`); continue; }
    await sim(40);
    console.log(`  [cross] ${verb} · grounded-at-stage=${grounded}`);
    await snap(`${verb}-front34`, 145, 2.4);
    await snap(`${verb}-profile`, 90);
  }
  }

} finally {
  await writeFile(`${OUT}/telemetry-${ARM}.json`, JSON.stringify({ sha, ARM, faithful: !!FAITHFUL, takes: TAKES, W, H, errs, log }, null, 2));
  await browser.close().catch(() => {});
  server.kill('SIGTERM');
  await release();
  console.log(`[spread] done · errs ${errs.length}`);
  if (errs.length) console.log(errs.slice(0, 6).join('\n'));
}

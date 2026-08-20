#!/usr/bin/env node
/**
 * rigfault.mjs — photograph the CHARACTER's pose defects, per state, with bone telemetry.
 *
 * Built for §522 defect 3 (user, on hardware: "arms feel switched at times; the head is
 * permanently looking upward"). The camera here is STAGED (freeCam for the capture only) because
 * the subject is the character, not the camera — the same reason `shot.mjs` stages, and the
 * opposite call from `camlook.mjs`. The sim itself runs with the rig ON and real key input, so
 * every pose is one gameplay actually produces, not a `freezePose` still.
 *
 * Per captured frame it writes, next to the PNG:
 *   · the movement state and the head bone's WORLD forward elevation in degrees
 *     (positive = the bone looks up; the DL skull adds its baked carry on top — dlaxes.mjs
 *     measures that carry at -12.0 deg X, chin-up, in every state);
 *   · local X of both upperArms and both upperLegs (the gait channels; -X = swing forward,
 *     Rig.js sign table), so "which arm/leg leads" is read from data, not squinted from pixels.
 *
 * Arms: CHAR=model3 runs the identical sequence on the procedural rebuild — same clips, no FBX
 * carry — so a defect present on both is CLIP DATA and a defect only on the shipped model is the
 * CARRY. Two models × two sneak contacts = two samples per claim.
 *
 *   node tools/rigfault.mjs                      shipped character (dlrig)
 *   CHAR=model3 node tools/rigfault.mjs          the control arm
 *   SEQ=idle,sneak …                             only those states (default: all)
 */
import { chromium } from 'playwright';
import { acquire } from './lock.mjs';
import { spawn, execFileSync } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import net from 'node:net';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const CHAR = process.env.CHAR || '';
const SEQ = (process.env.SEQ || 'idle,walk,sneak,run,crouch').split(',');
const seq = (k) => SEQ.includes(k);
const OUT = process.env.OUT || `${ROOT}/shots/rigfault${CHAR ? `-${CHAR}` : ''}`;
const W = Number(process.env.W || 960), H = Number(process.env.H || 540);
const Q = process.env.Q || 'high';

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
const release = await acquire('rigfault');
console.log(`[rigfault] lock · sha ${sha}${dirty ? ` · DIRTY\n${dirty}` : ' · clean'} · char=${CHAR || 'dlrig'}`);

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
  await page.goto(`http://127.0.0.1:${port}/?shot=1&q=${Q}${CHAR ? `&char=${CHAR}` : ''}`,
    { waitUntil: 'domcontentloaded', timeout: 120000 });
  await page.waitForFunction('window.__GAME && window.__GAME.ready === true', null, { timeout: 600000, polling: 500 });
  console.log('[rigfault] ready');
  await page.evaluate(() => {
    window.__ENGINE.stopLoop();
    window.__GAME.hideHud(true);
    window.__ENGINE.debug.freeCam = false;      // sim + rig run; freeCam flips ON per capture only
    window.__ENGINE.input.locked = true;        // same pointer-lock swallow as camlook (§468)
  });

  /* fast sim step, replicated from camlook.mjs — beginFrame pump included */
  await page.evaluate(() => {
    const e = window.__ENGINE;
    window.__simStep = (n, dt) => {
      for (let i = 0; i < n; i++) {
        e.input?.beginFrame?.();
        e.dt = Math.min(dt, 1 / 20) * e.timeScale;
        if (e.debug.paused || e.paused) e.dt = 0;
        e.time += e.dt; e.frame++;
        for (const { mod } of e._ordered) {
          if (typeof mod.update === 'function') { try { mod.update(e.dt, e.time); } catch {} }
        }
      }
    };
    /* bone telemetry: world forward elevation of head/neck, local X of the gait channels */
    window.__rigProbe = () => {
      const e = window.__ENGINE, m = e.get('movement'), ch = e.get('character');
      const B = ch?.bones || {};
      const elev = (bone) => {
        if (!bone) return null;
        bone.updateWorldMatrix(true, false);
        const el = bone.matrixWorld.elements;           // col 2 = local +Z in world
        const x = el[8], y = el[9], z = el[10];
        return +(Math.asin(y / Math.hypot(x, y, z)) * 180 / Math.PI).toFixed(1);
      };
      const lx = (bone) => (bone ? +(bone.rotation.x * 180 / Math.PI).toFixed(1) : null);
      return {
        st: m?.stateName,
        v: +Math.hypot(m.velocity.x, m.velocity.z).toFixed(2),
        headElev: elev(B.head), neckElev: elev(B.neck), chestElev: elev(B.chest),
        armLx: lx(B.upperArmL), armRx: lx(B.upperArmR),
        legLx: lx(B.upperLegL), legRx: lx(B.upperLegR),
        p: [+m.position.x.toFixed(2), +m.position.y.toFixed(2), +m.position.z.toFixed(2)],
        yaw: +(m.yaw ?? 0).toFixed(2),
      };
    };
  });
  const sim = (n = 1) => page.evaluate((k) => window.__simStep(k, 1 / 60), n);

  /** Stage the camera at a bearing off the character's FACING and capture. Sim untouched. */
  const snap = async (name, az = 90, dist = 2.6, h = 1.15) => {
    const tel = await page.evaluate(([azDeg, d, hh]) => {
      const e = window.__ENGINE, m = e.get('movement');
      const t = window.__rigProbe();
      const yaw = m.yaw ?? 0;
      const a = yaw + (azDeg * Math.PI / 180);
      const cx = m.position.x + Math.sin(a) * d;
      const cz = m.position.z + Math.cos(a) * d;
      e.debug.freeCam = true;
      e.camera.position.set(cx, m.position.y + hh, cz);
      e.camera.lookAt(m.position.x, m.position.y + 0.95, m.position.z);
      e.camera.updateMatrixWorld(true);
      return t;
    }, [az, dist, h]);
    const uri = await page.evaluate(() => window.__GAME.capture('image/png'));
    await page.evaluate(() => { window.__ENGINE.debug.freeCam = false; });
    await writeFile(`${OUT}/${name}.png`, Buffer.from(uri.split(',')[1], 'base64'));
    log.push({ frame: name, az, ...tel });
    console.log(`  -> ${name}.png  ${JSON.stringify(tel)}`);
    return tel;
  };

  await sim(40);

  /* idle — the head claim is state-independent, so the stillest state is sample one */
  if (seq('idle')) {
  console.log('[idle]');
  await snap('idle-profile', 90);
  await snap('idle-front34', 155, 2.4);
  }

  /* walk — the contralateral control gait (gaitcheck: 0% ipsi in data) */
  if (seq('walk')) {
  console.log('[walk]');
  await page.keyboard.down('KeyW');
  await sim(50);
  await snap('walk-a-profile', 90);
  await sim(18);                                     // ~0.3 s later, other half of the stride
  await snap('walk-b-profile', 90);
  await page.keyboard.up('KeyW');
  await sim(40);
  }

  /* sneak — gaitcheck says the arm lead lands on the planting foot's side (52% ipsi) */
  if (seq('sneak')) {
  console.log('[sneak]');
  await page.keyboard.down('ShiftLeft');
  await sim(10);
  await page.keyboard.down('KeyW');
  await sim(55);
  const s1 = await snap('sneak-a-profile', 90);
  await snap('sneak-a-front34', 145, 2.3);
  /* advance roughly half a sneak cycle so the mirrored contact is the second sample */
  await sim(26);
  const s2 = await snap('sneak-b-profile', 90);
  await snap('sneak-b-front34', 145, 2.3);
  await page.keyboard.up('KeyW');
  await page.keyboard.up('ShiftLeft');
  await sim(40);
  }

  /* run — faster gait, data says 17% crossover at passing only */
  if (seq('run')) {
  console.log('[run]');
  await page.keyboard.down('KeyW');
  await sim(70);
  await snap('run-a-profile', 90);
  await sim(10);
  await snap('run-b-profile', 90);
  await page.keyboard.up('KeyW');
  await sim(30);
  }

  /* head, second sample: a different still state (crouch) + a rear-quarter for the muzzle line */
  if (seq('crouch')) {
  console.log('[crouch]');
  await page.keyboard.down('ShiftLeft');
  await sim(30);
  await snap('sneakidle-profile', 90);
  await page.keyboard.up('ShiftLeft');
  await sim(30);
  await snap('idle2-rear34', 35, 2.6);
  }

  await writeFile(`${OUT}/telemetry.json`, JSON.stringify({ sha, char: CHAR || 'dlrig', W, H, log, errs }, null, 2));
  console.log(`[rigfault] done · ${log.length} frames · errs ${errs.length}`);
  if (errs.length) console.log(errs.join('\n').slice(0, 2000));
} finally {
  await browser.close().catch(() => {});
  server.kill();
  await release();
}

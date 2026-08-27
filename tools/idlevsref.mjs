#!/usr/bin/env node
/**
 * idlevsref.mjs — THEIR standing idle and OURS, same camera, same rig, same frame.
 *
 * §479.17. The user, after §479.16 widened the pose: *"The static pose does not appear to be the
 * same as the godot repo."* Every previous round on this pose measured clean and the user still
 * saw it, so the acceptance evidence has to be a picture rather than a table — and the only
 * picture that can settle "is it the same as theirs" is one that shows theirs.
 *
 * WHAT "THEIRS" MEANS HERE, and the distinction is the whole reason this tool exists: their
 * `Standupright` RETARGETED onto our rig is NOT their pose. The two rigs' rest arms differ ~14.5°
 * (§479.6), and the world-delta retarget composes their motion onto OUR wider bind, so the same
 * authored pose arrives 19 cm wider — measured, 66.6 cm of hand separation against the 47.7 cm
 * their own rig shows. So this renders BOTH readings side by side:
 *
 *   ref-retarget   GODOT_CLIPS.Standupright played straight — "port the clip", and the answer
 *                  to why we did not just do that.
 *   ours           the shipped idle, solved to their MEASURED pose geometry (§479.17).
 *
 * Frames named `front` are guarded by §479.14's camDot: RIG3 faces +Z and the camera sits at
 * yaw+az, so cam·facing = cos(az) and a "front" frame must measure > 0.3 or the run throws.
 *
 *   node tools/idlevsref.mjs
 */
import { chromium } from 'playwright';
import { acquire } from './lock.mjs';
import { spawn, execFileSync } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import net from 'node:net';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const OUT = process.env.OUT || `${ROOT}/shots/idle17`;
const W = Number(process.env.W || 1600), H = Number(process.env.H || 900);

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
await mkdir(OUT, { recursive: true });
const release = await acquire('idlevsref');
console.log(`[vsref] lock · sha ${sha}`);

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
/* the in-page probes, as a function because §715's mode re-navigates (the `?idle=` token is a
   module-load seam, so each arm is a fresh page) and needs them re-installed each time */
const installProbes = () => page.evaluate(() => {
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
    /* hand geometry in the pose's own shoulder-line frame — idleref.mjs's numbers, live */
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

const boot = async (extraQuery = '') => {
  await page.goto(`http://127.0.0.1:${port}/?shot=1&q=high${extraQuery}`, { waitUntil: 'domcontentloaded', timeout: 120000 });
  await page.waitForFunction('window.__GAME && window.__GAME.ready === true', null, { timeout: 600000, polling: 500 });
  await installProbes();
};

try {
  await boot();
  const sim = (n = 1) => page.evaluate((k) => window.__simStep(k, 1 / 60), n);
  const snap = async (name, az) => {
    const tel = await page.evaluate(([azDeg]) => {
      const e = window.__ENGINE, m = e.get('movement');
      const a2 = (m.yaw ?? 0) + (azDeg * Math.PI / 180);
      e.debug.freeCam = true;
      e.camera.position.set(m.position.x + Math.sin(a2) * 2.4, m.position.y + 1.15, m.position.z + Math.cos(a2) * 2.4);
      e.camera.lookAt(m.position.x, m.position.y + 0.95, m.position.z);
      e.camera.updateMatrixWorld(true);
      const camDot = Math.cos(azDeg * Math.PI / 180);
      return { az: azDeg, camDot: +camDot.toFixed(2), view: camDot > 0.3 ? 'front' : camDot < -0.3 ? 'REAR' : 'profile', ...window.__handProbe() };
    }, [az]);
    const uri = await page.evaluate(() => window.__GAME.capture('image/png'));
    await page.evaluate(() => { window.__ENGINE.debug.freeCam = false; });
    await writeFile(`${OUT}/${name}.png`, Buffer.from(uri.split(',')[1], 'base64'));
    if (/front/.test(name) && tel.view !== 'front') {
      throw new Error(`idlevsref: "${name}" was shot from ${tel.view} (cam·facing ${tel.camDot}) — §479.14`);
    }
    log.push({ frame: name, ...tel });
    console.log(`  -> ${name}.png  sep ${tel.sepCm} cm  outL ${tel.outL}  outR ${tel.outR}  (cam·facing ${tel.camDot})`);
    return tel;
  };

  await sim(40);
  await page.evaluate(() => { const m = window.__ENGINE.get('movement'); m.position.set(0, 0, 30); m.velocity.set(0, 0, 0); });
  await sim(120);

  /* MODE=pole (§479.18): the shipped pole_climb — which now runs BACKWARDS, the way their
     `play_mode = 1` node plays it — against the FORWARD source it used to be. Posed through the
     real play() seam (movement parked) because the moveset needs a real drainpipe to enter the
     state, which is the hardware sheet's half. Two phases per arm (§466.5). */
  /* MODE=idle715 (§715): the owner's conditional ruling put the recovered repo idles in the two
     standing slots, with §479.20's endorsed static one token away. This shoots BOTH ARMS on the
     §479.20 cameras — front-three-quarter (az 35, camDot-guarded) and profile (az 90) — both
     slots each, so the before/after the ruling asks for is eight frames of the same rig on the
     same lens. Each arm is a fresh page: the `?idle=` token is a module-load seam, like
     `?anim=`, and the live CLIP_ORIGIN is asserted per arm so a frame cannot be labelled with a
     regime it is not showing. */
  if (process.env.MODE === 'idle715') {
    /* (−4, 0, 26), not the default (0, 0, 30): market props have accumulated on the old spot
       since idle20 and the first §715 take photographed the pose behind a stack of pots —
       camdot's chest ray passed while the limbs were covered, so the spot was re-preflighted
       on BOTH cameras (front34 and profile, VERDICT ok) and the frames re-read. */
    for (const arm of ['repo', 'pose']) {
      if (arm === 'pose') await boot('&idle=pose');
      await sim(40);
      /* yaw is PINNED to the preflighted geometry, not left to the settle: the az-relative
         cameras follow m.yaw, and the first two takes proved the point in both directions —
         a stray yaw put the "profile" camera inside the west arcade with the ceiling filling
         60% of the frame. yaw 0 is what the camdot preflight of this spot actually tested. */
      await page.evaluate(() => { const m = window.__ENGINE.get('movement'); m.position.set(-4, 0, 26); m.velocity.set(0, 0, 0); m.yaw = 0; });
      await sim(120);
      await page.evaluate(() => { const m = window.__ENGINE.get('movement'); m.yaw = 0; });
      const org = await page.evaluate(async () => (await import('/src/player/Animation.js')).CLIP_ORIGIN.idle_confident);
      const want = arm === 'repo' ? 'godot:Idle Anim 1' : 'godot:Standupright';
      if (org !== want) throw new Error(`idle715: arm "${arm}" boots with idle_confident=${org}, expected ${want}`);
      await page.evaluate(() => { window.__SKIPMOVE = true; });
      await sim(4);
      for (const slot of ['idle_confident', 'idle_look']) {
        await page.evaluate(async (n) => {
          const A = await import('/src/player/Animation.js');
          window.__ENGINE.get('animation').play(n, { fade: 0, loop: A.ACTIVE[n].loop, speed: 1 });
        }, slot);
        await sim(40);
        const tag = slot.replace('idle_', '');
        await snap(`idle715-${arm}-${tag}-front34`, 35);
        await snap(`idle715-${arm}-${tag}-profile`, 90);
      }
    }
  } else if (process.env.MODE === 'pole') {
    const phases = [0.25, 0.6];
    await page.evaluate(() => { window.__SKIPMOVE = true; });
    await sim(4);
    for (const [tag, forward] of [['shipped-reversed', false], ['old-forward', true]]) {
      await page.evaluate(async (fwd) => {
        const A = await import('/src/player/Animation.js');
        const C = await import('/src/player/Clips.js');
        const G = await import('/src/player/GodotClips.js');
        if (fwd) A.ACTIVE.__pole = C.compile('__pole', G.GODOT_CLIPS.PoleClimbing);
        else A.ACTIVE.__pole = A.ACTIVE.pole_climb;
        window.__ENGINE.get('animation').play('__pole', { fade: 0, loop: true, speed: 1 });
      }, forward);
      for (const ph of phases) {
        await page.evaluate(async (p) => {
          const A = await import('/src/player/Animation.js');
          const a = window.__ENGINE.get('animation');
          const tr = a.tracks.find((t) => t.clip === A.ACTIVE.__pole);
          if (tr) tr.time = p * A.ACTIVE.__pole.dur;
        }, ph);
        await sim(1);
        await snap(`pole-${tag}-p${Math.round(ph * 100)}-front34`, 35);
      }
    }
  } else {

  /* §479.20 MODE=ruled — acceptance for the user's ruling ("I like the raw standupright more").
     The shipped standing idle is now the repo's `Standupright` played raw, in BOTH slots the
     player can end up in: `idle_confident` on arrival and `idle_look` after 13 s of standing
     still (Moveset.js:141). Two slots × front-three-quarter + profile = the two samples §466.5
     wants, and the profile is not optional here: raw arms can read wide from the front while
     clipping the torso from the side, which the front frame cannot see. */
  if (process.env.MODE === 'ruled') {
    await page.evaluate(() => { window.__SKIPMOVE = true; });
    await sim(4);
    for (const slot of ['idle_confident', 'idle_look']) {
      await page.evaluate(async (n) => {
        const A = await import('/src/player/Animation.js');
        window.__ENGINE.get('animation').play(n, { fade: 0, loop: A.ACTIVE[n].loop, speed: 1 });
      }, slot);
      await sim(40);
      const tag = slot.replace('idle_', '');
      await snap(`ruled-${tag}-front34`, 35);
      await snap(`ruled-${tag}-profile`, 90);
    }
  } else {
  /* OURS — the shipped standing idle, settled */
  await snap('ours-front34', 35);
  await snap('ours-profile', 90);

  /* THEIRS, retargeted — injected into the live clip table and played through the real seam */
  const ok = await page.evaluate(async () => {
    const A = await import('/src/player/Animation.js');
    const C = await import('/src/player/Clips.js');
    const G = await import('/src/player/GodotClips.js');
    const raw = G.GODOT_CLIPS.Standupright;
    if (!raw) return false;
    A.ACTIVE.__refidle = C.compile('__refidle', raw);
    window.__SKIPMOVE = true;
    window.__ENGINE.get('animation').play('__refidle', { fade: 0, loop: true, speed: 1 });
    return true;
  });
  if (!ok) throw new Error('idlevsref: GODOT_CLIPS.Standupright missing');
  await sim(60);
  await snap('refretarget-front34', 35);
  await snap('refretarget-profile', 90);
  }
  }
} finally {
  await writeFile(`${OUT}/telemetry-vsref.json`, JSON.stringify({ sha, W, H, errs, log }, null, 2));
  await browser.close().catch(() => {});
  server.kill('SIGTERM');
  await release();
  console.log(`[vsref] done · ${log.length} frames · errs ${errs.length}`);
  if (errs.length) console.log(errs.slice(0, 6).join('\n'));
}

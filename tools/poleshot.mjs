#!/usr/bin/env node
/**
 * poleshot.mjs — §720's acceptance frames: the pole HANG, the pole CLIMB, and a RING CATCH.
 *
 *   node tools/poleshot.mjs
 *
 * ── WHAT MAKES THESE FRAMES EVIDENCE AND NOT DECORATION ───────────────────────────────────
 *
 * §717.9's pole frames posed a clip on a character standing in the courtyard. That is the right
 * instrument for "what does this clip look like" and the WRONG one for §720, whose whole claim is
 * about a hand on a shaft: a pole clip photographed with no pole in the picture cannot show
 * whether the glove reaches it. So every frame here is DRIVEN — Sly walks into the shipped
 * drainpipe at (21.35, ., -2) (r 0.18, bottom 0, the only climbable in the level whose foot is on
 * the ground) and is photographed on it, with the pipe in frame.
 *
 * Three guards, because two of them have caught this project before:
 *   · camDot PRE-FLIGHT on every camera before the browser is launched (§604) — a lens inside a
 *     prop, or aimed through one, is refused rather than discovered afterwards.
 *   · cam·facing asserted at the shutter (§479.14/§466.5) — a tool here labelled rear shots
 *     "front" for its entire life, so a name containing `front` that measures below 0.3 throws.
 *   · THE LIVE CLIP NAME asserted at the shutter. A frame captioned `pole_idle` that is showing
 *     `pole_climb` would be the §720-shaped lie, so the running track's clip name is read off the
 *     mixer and compared before the shutter fires, per frame.
 *
 * Two arms, because §720's climb half ships behind a revert token: the default and `?pole=climb`,
 * each a fresh page (the token is a module-load seam).
 */
import { chromium } from 'playwright';
import { acquire } from './lock.mjs';
import { camDot } from './camdot.mjs';
import { spawn, execFileSync } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import net from 'node:net';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const OUT = process.env.OUT || `${ROOT}/shots/pole720`;
const W = Number(process.env.W || 1600), H = Number(process.env.H || 900);

const PIPE = { x: 21.35, z: -2 };
/* Where `PoleClimb.place()` puts him on that pipe: pole + hold·(sin a, 0, cos a) with the mount
   walked in from the east, so a = +pi/2 and hold = r 0.18 + radius 0.34 x 0.8 = 0.452. Yaw faces
   the pole, i.e. west. Both are re-read live at the shutter; these are only for the pre-flight. */
const STANCE = { x: PIPE.x + 0.452, y: 0.10, z: PIPE.z, yaw: -Math.PI / 2 };
const RING = { x: 4.2, y: 14.8, z: 4.5 };          // hook-main-3, the courtyard chain

async function freePort(start = 6300) {
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

/* ---------------- camDot pre-flight, before a browser exists ---------------- */
const camAt = (p, yaw, az, r = 2.6, up = 1.05) => [
  p.x + Math.sin(yaw + az * Math.PI / 180) * r,
  p.y + up,
  p.z + Math.cos(yaw + az * Math.PI / 180) * r,
];
/* The AZIMUTHS ARE THE PRE-FLIGHT'S ANSWER, not a choice. This pipe is a DRAINPIPE — it runs up
   a building — so the whole western half of the circle around the stance is inside masonry. A
   full sweep through camDot at both radii refused +35 (nearest 0.045 m, the lens in the wall),
   +90 (0.10 m) and everything from 120 to 180; -35 and -90 are clean at 1.50 and 0.81 m of air
   with the subject unoccluded, and cos(-35 deg) = 0.82 still satisfies §479.14's front test. A
   "front34" that had been left at +35 out of symmetry would have photographed the inside of a
   sandstone block, which is §603 exactly. */
const PRE = [
  ['pole front34', camAt(STANCE, STANCE.yaw, -35), [STANCE.x, STANCE.y + 0.95, STANCE.z]],
  ['pole profile', camAt(STANCE, STANCE.yaw, -90), [STANCE.x, STANCE.y + 0.95, STANCE.z]],
  /* The ring catch is photographed from the ring's own hang position, 2.2 m below the anchor. */
  ['ring front34', camAt({ x: RING.x, y: RING.y - 2.2, z: RING.z }, 0, 35, 3.2, 1.05),
    [RING.x, RING.y - 1.4, RING.z]],
  ['ring profile', camAt({ x: RING.x, y: RING.y - 2.2, z: RING.z }, 0, 90, 3.2, 1.05),
    [RING.x, RING.y - 1.4, RING.z]],
];
console.log('[poleshot] camDot pre-flight');
for (const [name, pos, look] of PRE) {
  const r = await camDot(pos, look);
  console.log(`  ${name.padEnd(14)} enclosed ${r.near}/${r.dirs}  nearest ${r.nearest} m  `
    + `forward ${r.forward} m (${r.forwardName})  subject at ${r.targetLen} m  -> ${r.ok ? 'ok' : 'REFUSE'}`);
  if (!r.ok && process.env.CAMDOT !== '0') {
    throw new Error(`poleshot: camera "${name}" refused by camDot:\n  - ${r.reasons.join('\n  - ')}`);
  }
}

const sha = execFileSync('git', ['rev-parse', '--short', 'HEAD'], { cwd: ROOT, encoding: 'utf8' }).trim();
await mkdir(OUT, { recursive: true });
const release = await acquire('poleshot');
console.log(`[poleshot] lock · sha ${sha} · out ${OUT}`);

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

const rows = [];

const installProbes = () => page.evaluate(() => {
  window.__ENGINE.stopLoop();
  window.__GAME.hideHud(true);
  window.__ENGINE.debug.freeCam = false;
  const e = window.__ENGINE;
  /**
   * A stepper that can DRIVE. `beginFrame` folds `move` out of the key state, so an intent is
   * written after it and before the module loop — the same seam every offline driver in
   * `tests/` uses (`engine.input.move.y = 1`), rather than synthesising key events whose
   * lifetime this harness would then own.
   */
  window.__driveStep = (n, dt, cmd) => {
    for (let i = 0; i < n; i++) {
      e.input?.beginFrame?.(dt);
      if (cmd) {
        e.input.move.x = cmd.mx || 0;
        e.input.move.y = cmd.my || 0;
        if (cmd.aimAt) {
          const dx = cmd.aimAt[0] - e.get('movement').position.x;
          const dz = cmd.aimAt[2] - e.get('movement').position.z;
          e.camera.rotation.set(0, Math.atan2(-dx, -dz), 0, 'YXZ');
          e.camera.updateMatrixWorld(true);
        }
      }
      e.dt = Math.min(dt, 1 / 20) * e.timeScale;
      e.time += e.dt; e.frame++;
      for (const { key, mod } of e._ordered) {
        if (typeof mod.update === 'function') { try { mod.update(e.dt, e.time); } catch {} }
      }
    }
  };
  /** The clip actually on screen: the heaviest live track, or the tree if none. */
  window.__liveClip = () => {
    const a = e.get('animation');
    const live = a.tracks.filter((t) => t.clip && t.w > 0.01).sort((x, y) => y.w - x.w);
    return live.length ? { name: live[0].clip.name, w: +live[0].w.toFixed(2), n: live.length } : { name: '(tree)', w: 0, n: 0 };
  };
  window.__state = () => {
    const m = e.get('movement');
    return { state: m.stateName, pos: [m.position.x, m.position.y, m.position.z], yaw: m.yaw };
  };
});

const boot = async (extraQuery = '') => {
  await page.goto(`http://127.0.0.1:${port}/?shot=1&q=high${extraQuery}`, { waitUntil: 'domcontentloaded', timeout: 120000 });
  await page.waitForFunction('window.__GAME && window.__GAME.ready === true', null, { timeout: 600000, polling: 500 });
  await installProbes();
};

/** Shutter. `want` is the clip the caption claims; a mismatch throws before the PNG is written. */
async function snap(name, az, want, radius = 2.6, up = 1.05, lookUp = 0.95) {
  const tel = await page.evaluate(([azDeg, r, u, lu]) => {
    const e = window.__ENGINE, m = e.get('movement');
    const a2 = (m.yaw ?? 0) + (azDeg * Math.PI / 180);
    e.debug.freeCam = true;
    e.camera.position.set(m.position.x + Math.sin(a2) * r, m.position.y + u, m.position.z + Math.cos(a2) * r);
    e.camera.lookAt(m.position.x, m.position.y + lu, m.position.z);
    e.camera.updateMatrixWorld(true);
    const camDotV = Math.cos(azDeg * Math.PI / 180);
    return {
      az: azDeg, camDot: +camDotV.toFixed(2),
      view: camDotV > 0.3 ? 'front' : camDotV < -0.3 ? 'REAR' : 'profile',
      clip: window.__liveClip(), ...window.__state(),
      /* The camera the shutter ACTUALLY used. The pre-flight above checks stances predicted
         offline, and a driven subject does not always end up where the prediction put him — the
         ring catch lands 3.6 m above the hang position the pre-flight assumed. So the real
         positions are printed and re-run through camDot afterwards; a pre-flight of a place the
         camera did not go is §603 wearing a clean shirt. */
      camPos: [e.camera.position.x, e.camera.position.y, e.camera.position.z],
      lookAt: [m.position.x, m.position.y + lu, m.position.z],
    };
  }, [az, radius, up, lookUp]);
  if (/front/.test(name) && tel.view !== 'front') {
    throw new Error(`poleshot: "${name}" was shot from ${tel.view} (cam·facing ${tel.camDot}) — §479.14`);
  }
  if (want && tel.clip.name !== want) {
    throw new Error(`poleshot: "${name}" claims "${want}" but the mixer is showing `
      + `"${tel.clip.name}" at w${tel.clip.w} — the caption would be a lie`);
  }
  const uri = await page.evaluate(() => window.__GAME.capture('image/png'));
  await page.evaluate(() => { window.__ENGINE.debug.freeCam = false; });
  await writeFile(`${OUT}/${name}.png`, Buffer.from(uri.split(',')[1], 'base64'));
  rows.push({ frame: name, ...tel });
  console.log(`  -> ${name}.png  clip ${tel.clip.name} w${tel.clip.w} (${tel.clip.n} live)  `
    + `state ${tel.state}  pos ${tel.pos.map((v) => v.toFixed(2))}  cam·facing ${tel.camDot}`);
  console.log(`     CAM ${tel.camPos.map((v) => v.toFixed(4)).join(' ')}  LOOK ${tel.lookAt.map((v) => v.toFixed(4)).join(' ')}`);
  return tel;
}

/** Walk into the drainpipe from 2.6 m east and return the frame the mount happened on. */
async function mount() {
  await page.evaluate(([x, z]) => {
    const m = window.__ENGINE.get('movement');
    m.position.set(x + 2.6, 0.2, z); m.velocity.set(0, 0, 0); m.yaw = -Math.PI / 2;
  }, [PIPE.x, PIPE.z]);
  await page.evaluate((c) => window.__driveStep(20, 1 / 60, c), null);
  const got = await page.evaluate(([x, z]) => {
    for (let i = 0; i < 260; i++) {
      window.__driveStep(1, 1 / 60, { my: 1, aimAt: [x, 0, z] });
      if (window.__ENGINE.get('movement').stateName === 'poleClimb') return i;
    }
    return -1;
  }, [PIPE.x, PIPE.z]);
  if (got < 0) throw new Error('poleshot: never mounted the drainpipe in the browser');
  return got;
}

try {
  /* ── ARM 1: the shipped default ─────────────────────────────────────────────────────────── */
  await boot();
  const mountedAt = await mount();
  console.log(`[poleshot] default arm: mounted at frame ${mountedAt}`);
  /* The MOUNT one-shot, caught while it is still the heaviest track. `PoleGrab` runs 0.67 s;
     four frames in it is past the fade-in and well before it retires. */
  await page.evaluate(() => window.__driveStep(4, 1 / 60, { my: 0 }));
  await snap('pole-grab-front34', -35, 'pole_grab');
  /* Then hold still and let the catch retire: the HANG. */
  await page.evaluate(() => window.__driveStep(70, 1 / 60, { my: 0 }));
  await snap('pole-idle-front34', -35, 'pole_idle');
  await snap('pole-idle-profile', -90, 'pole_idle');
  /* And the climb, for the pair §466.5 asks for. */
  await page.evaluate(() => window.__driveStep(30, 1 / 60, { my: 1 }));
  await snap('pole-climb-front34', -35, 'pole_climb');

  /* THE RING CATCH — a fall onto hook-main-3 with the halved acquisition volume live. */
  const catchTel = await page.evaluate(([x, y, z]) => {
    const e = window.__ENGINE, m = e.get('movement');
    m.position.set(x + 0.35, y + 10.5, z); m.velocity.set(0, 0, 0);
    m.grounded = false; m.sm.set('fall');
    for (let i = 0; i < 200; i++) {
      window.__driveStep(1, 1 / 60, { my: 0 });
      if (m.stateName === 'hookSwing') return { at: i, anchor: m.anchor ? [m.anchor.x, m.anchor.y, m.anchor.z] : null };
    }
    return { at: -1 };
  }, [RING.x, RING.y, RING.z]);
  if (catchTel.at < 0) throw new Error('poleshot: the ring was never caught in the browser');
  console.log(`[poleshot] ring catch at frame ${catchTel.at}, anchor ${catchTel.anchor?.map((v) => v.toFixed(2))}`);
  /* THE CATCH ITSELF is `hook_grab`, the one-shot `HookSwing.enter` fires — not `hook_swing`,
     which is the hang that follows it. The first draft asked for `hook_swing` here and the
     shutter refused: the mixer was showing `hook_grab` at w1, exactly as it should be. The
     caption was wrong, not the game, and the guard caught it before a PNG existed. Both beats
     are photographed, each labelled with what it actually is. */
  await page.evaluate(() => window.__driveStep(16, 1 / 60, { my: 0 }));
  await snap('ring-catch-front34', 35, 'hook_grab', 3.2, 1.05, 1.2);
  await snap('ring-catch-profile', 90, 'hook_grab', 3.2, 1.05, 1.2);
  await page.evaluate(() => window.__driveStep(70, 1 / 60, { my: 0 }));
  await snap('ring-swing-front34', 35, 'hook_swing', 3.2, 1.05, 1.2);
  const mag = await page.evaluate(async () => {
    const L = await import('/src/world/EgyptLevel.js');
    const m = window.__ENGINE.get('movement');
    const t = m.targets.list.find((x) => x.id === 'hook-main-3');
    return { swing: L.MAG.volumeSwing, low: L.MAG.volumeLow, live: t?.volume, general: L.MAG.volume };
  });
  console.log(`[poleshot] live magnetism in the frames above: ring volume ${mag.live} `
    + `(MAG.volumeSwing ${mag.swing}, volumeLow ${mag.low}, general ${mag.general})`);

  /* ── ARM 2: `?pole=climb`, the revert, exercised through the URL ────────────────────────── */
  await boot('&pole=climb');
  const mounted2 = await mount();
  console.log(`[poleshot] ?pole=climb arm: mounted at frame ${mounted2}`);
  await page.evaluate(() => window.__driveStep(70, 1 / 60, { my: 0 }));
  /* THE POINT OF THIS FRAME: standing still on the pipe, the reverted build shows `pole_climb` —
     the defect §715.2 named, restored on purpose by one token. The `want` check is what makes it
     evidence: if the token did nothing, the shutter throws instead of producing a caption. */
  await snap('revert-idle-front34', -35, 'pole_climb');

  const bad = errs.filter((e) => !/kaykit|Failed to load resource/i.test(e));
  console.log(`\n[poleshot] ${rows.length} frames, errs ${bad.length}`);
  if (bad.length) console.log(bad.slice(0, 8).map((e) => `   ! ${e}`).join('\n'));
} finally {
  await browser.close().catch(() => {});
  server.kill('SIGTERM');
  release();
}

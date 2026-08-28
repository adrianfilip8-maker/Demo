#!/usr/bin/env node
/**
 * swingshot.mjs — §723's acceptance frames: the ring swing PINNED (arm A) and the steep-slope
 * climb ANIMATED (arm B), each beside its own revert arm.
 *
 *   node tools/swingshot.mjs
 *
 * ── WHAT MAKES THESE FRAMES EVIDENCE AND NOT DECORATION (poleshot's three guards, kept) ─────
 *   · camDot PRE-FLIGHT on the predicted stances before the browser launches (§604), and a
 *     RE-RUN on every camera the shutter ACTUALLY used after it closes — a driven subject does
 *     not land where a prediction puts him, and a pre-flight of a place the camera did not go
 *     is §603 wearing a clean shirt (§720.10's words).
 *   · cam·facing asserted at the shutter (§479.14/§466.5) — "front" below 0.3 throws.
 *   · THE LIVE CLIP asserted at the shutter, read off the mixer — plus, for arm B's gait
 *     frames, the base-clip REQUEST, because the locomotion tree plays with no track at all
 *     and "(tree)" alone would not say which gait.
 *
 * ── §723A's own fourth guard ────────────────────────────────────────────────────────────────
 *   The claim "the crook stays ON the ring" is a PIXEL claim (§466.5), so at every swing
 *   shutter the crook seat and the ring anchor are projected through the very camera that took
 *   the PNG and their separation is reported in px and in frame-metres (px scaled by a
 *   projected vertical metre at the ring's own depth). Both extremes of the arc, front AND
 *   side; the `?swing=loose` arm runs the same instrument and must show the detachment.
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
const OUT = process.env.OUT || `${ROOT}/shots/swing723`;
const W = Number(process.env.W || 1600), H = Number(process.env.H || 900);

const RING = { x: 4.2, y: 14.8, z: 4.5 };            // hook-main-3, §720's own leg
const HANG = { x: RING.x, y: RING.y - 2.2, z: RING.z };
const DUNE = { x: -76, z: 50, up: { x: 0.97, z: 0.26 } };   // §515.3's far-west dune line
const DUNE_MID = { x: -66.5, y: 11.3, z: 52.6 };     // where the surf runs by frame ~120 (headless trace)
const GAITS = new Set(['walk', 'run', 'run_fast']);

async function freePort(start = 6600) {
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
const camAt = (p, yaw, az, r = 2.9, up = 1.05) => [
  p.x + Math.sin(yaw + az * Math.PI / 180) * r,
  p.y + up,
  p.z + Math.cos(yaw + az * Math.PI / 180) * r,
];
/* The swing cameras stage around the HANG position under ring 3 — open courtyard air, both
   sides clean (§720.10 pre-flighted the same zone). The dune FRONT cameras are RAISED (+3.6):
   at lens height +1.05 a camera 2.9 m uphill of a 54° face is inside the dune — the terrain
   climbs ~3.9 m over that run — so the front pair looks DOWN at him instead, which keeps the
   §479.14 azimuth test intact (facing is measured on azimuth, not elevation). */
/* The radii/heights here are THE ONES THE SHUTTERS USE (r 5.2/up 2.0 swing, r 3.0/up 3.6 dune
   front) — a pre-flight of a camera the shutter does not place is §603 wearing a clean shirt,
   and the first draft of this table checked r 3.2 swing cameras while the snaps used 5.2. */
const PRE = [
  ['swing front34', camAt(HANG, 0, 35, 5.2, 2.0), [HANG.x, HANG.y + 1.4, HANG.z]],
  ['swing profile', camAt(HANG, 0, 90, 5.2, 2.0), [HANG.x, HANG.y + 1.4, HANG.z]],
  ['dune front34', camAt(DUNE_MID, Math.atan2(DUNE.up.x, DUNE.up.z), 35, 3.0, 3.6), [DUNE_MID.x, DUNE_MID.y + 0.7, DUNE_MID.z]],
  ['dune profile', camAt(DUNE_MID, Math.atan2(DUNE.up.x, DUNE.up.z), -90, 3.0, 1.4), [DUNE_MID.x, DUNE_MID.y + 0.7, DUNE_MID.z]],
];
console.log('[swingshot] camDot pre-flight');
for (const [name, pos, look] of PRE) {
  const r = await camDot(pos, look);
  console.log(`  ${name.padEnd(14)} enclosed ${r.near}/${r.dirs}  nearest ${r.nearest} m  `
    + `forward ${r.forward} m (${r.forwardName})  subject at ${r.targetLen} m  -> ${r.ok ? 'ok' : 'REFUSE'}`);
  if (!r.ok && process.env.CAMDOT !== '0') {
    throw new Error(`swingshot: camera "${name}" refused by camDot:\n  - ${r.reasons.join('\n  - ')}`);
  }
}

const sha = execFileSync('git', ['rev-parse', '--short', 'HEAD'], { cwd: ROOT, encoding: 'utf8' }).trim();
await mkdir(OUT, { recursive: true });
const release = await acquire('swingshot');
console.log(`[swingshot] lock · sha ${sha} · out ${OUT}`);

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

const installProbes = () => page.evaluate(async ([w, h]) => {
  window.__ENGINE.stopLoop();
  window.__GAME.hideHud(true);
  window.__ENGINE.debug.freeCam = false;
  const e = window.__ENGINE;
  /* no `import('three')` here — the page cannot resolve the bare specifier from an eval, and it
     is not needed: the engine's own objects carry their THREE prototypes, so `.clone()` on any
     live Vector3 mints new ones. */
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
  window.__liveClip = () => {
    const a = e.get('animation');
    const live = a.tracks.filter((t) => t.clip && t.w > 0.01).sort((x, y) => y.w - x.w);
    return live.length ? { name: live[0].clip.name, w: +live[0].w.toFixed(2), n: live.length } : { name: '(tree)', w: 0, n: 0 };
  };
  window.__state = () => {
    const m = e.get('movement');
    return {
      state: m.stateName, base: m._baseClip, pos: [m.position.x, m.position.y, m.position.z],
      yaw: m.yaw, vy: m.velocity.y, w: m._swingW ?? 0,
      dev: (() => {
        const d = Math.hypot(m.position.x - m.anchor.x, m.position.y - m.anchor.y, m.position.z - m.anchor.z) || 1;
        return Math.acos(Math.max(-1, Math.min(1, (m.anchor.y - m.position.y) / d))) * 180 / Math.PI;
      })(),
      speed3: Math.hypot(m.velocity.x, m.velocity.y, m.velocity.z),
    };
  };
  /* §723A's pixel instrument: the crook seat and the ring anchor through the SHUTTER's camera. */
  window.__crookRing = () => {
    const m = e.get('movement');
    const ch = e.get('character');
    if (!ch?.cane?.hookPoint) return null;
    ch.root.updateMatrixWorld(true);
    const hp = ch.cane.hookPoint.clone();
    ch.cane.object.localToWorld(hp);
    const a = m.anchor.clone();
    const proj = (v) => {
      const p = v.clone().project(e.camera);
      return [(p.x * 0.5 + 0.5) * w, (0.5 - p.y * 0.5) * h];
    };
    const up = a.clone().set(a.x, a.y + 1, a.z);
    const c2 = proj(hp), r2 = proj(a), up1 = proj(up);
    const pxPerM = Math.hypot(up1[0] - r2[0], up1[1] - r2[1]);
    const px = Math.hypot(c2[0] - r2[0], c2[1] - r2[1]);
    return {
      worldM: +hp.distanceTo(a).toFixed(4), px: +px.toFixed(1),
      frameM: +(px / Math.max(1e-6, pxPerM)).toFixed(4), pxPerM: +pxPerM.toFixed(1),
      crookPx: c2.map((v) => +v.toFixed(0)), ringPx: r2.map((v) => +v.toFixed(0)),
    };
  };
  /* drive until a pendulum turning point: deviation past `minDev`, total speed near zero */
  window.__toExtreme = (maxFrames, cmd, minDev) => {
    const m = e.get('movement');
    for (let i = 0; i < maxFrames; i++) {
      window.__driveStep(1, 1 / 60, cmd);
      const s = window.__state();
      if (m.stateName !== 'hookSwing') return { lost: s.state, i };
      if (s.dev > minDev && s.speed3 < 1.0 && i > 8) return { i, dev: +s.dev.toFixed(1), side: Math.sign(m.position.x - m.anchor.x) || 1 };
    }
    return null;
  };
}, [W, H]);

const boot = async (extraQuery = '') => {
  await page.goto(`http://127.0.0.1:${port}/?shot=1&q=high${extraQuery}`, { waitUntil: 'domcontentloaded', timeout: 120000 });
  await page.waitForFunction('window.__GAME && window.__GAME.ready === true', null, { timeout: 600000, polling: 500 });
  await installProbes();
};

/**
 * Shutter. `want.clip` is the mixer clip the caption claims ('(tree)' for the locomotion
 * tree); `want.base` additionally pins the base-clip request; `want.state` the machine state.
 * `opts.liveCam` keeps the game's own camera — the containment shots — instead of staging one.
 */
async function snap(name, az, want = {}, opts = {}) {
  const tel = await page.evaluate(([azDeg, o]) => {
    const e = window.__ENGINE, m = e.get('movement');
    if (!o.liveCam) {
      /* NOT `debug.freeCam` — capture() below runs a full `renderFrame(0)` to fill the buffer,
         and Controller's freeCam branch zeroes the §723A pin (and §610's lag) before pushing the
         root, so a freeCam-staged swing PNG renders the UNPINNED body while the telemetry reads
         the pinned one. Found on this tool's own first run: crook->ring 0 m at the shutter, 3.9 m
         one capture later with no drive in between. The camera module is muted for the shutter
         instead, and restored right after — movement's own dt=0 path recomputes the pin. */
      const rec = e._ordered.find((x) => x.key === 'camera');
      if (rec && !window.__camMuted) { window.__camMuted = rec.mod.update; rec.mod.update = () => {}; }
      const a2 = (m.yaw ?? 0) + (azDeg * Math.PI / 180);
      e.camera.position.set(
        m.position.x + Math.sin(a2) * (o.r ?? 3.2),
        m.position.y + (o.up ?? 1.05),
        m.position.z + Math.cos(a2) * (o.r ?? 3.2));
      e.camera.lookAt(m.position.x, m.position.y + (o.lookUp ?? 0.8), m.position.z);
      e.camera.updateMatrixWorld(true);
    }
    const camDotV = Math.cos(azDeg * Math.PI / 180);
    return {
      az: azDeg, camDot: +camDotV.toFixed(2),
      view: o.liveCam ? 'live' : camDotV > 0.3 ? 'front' : camDotV < -0.3 ? 'REAR' : 'profile',
      clip: window.__liveClip(), ...window.__state(),
      crookRing: window.__crookRing(),
      camPos: [e.camera.position.x, e.camera.position.y, e.camera.position.z],
      lookAt: [m.position.x, m.position.y + (o.lookUp ?? 0.8), m.position.z],
    };
  }, [az, opts]);
  if (/front/.test(name) && tel.view !== 'front' && tel.view !== 'live') {
    throw new Error(`swingshot: "${name}" was shot from ${tel.view} (cam·facing ${tel.camDot}) — §479.14`);
  }
  if (want.clip && tel.clip.name !== want.clip) {
    throw new Error(`swingshot: "${name}" claims "${want.clip}" but the mixer shows `
      + `"${tel.clip.name}" at w${tel.clip.w} — the caption would be a lie`);
  }
  if (want.base && !GAITS.has(tel.base)) {
    throw new Error(`swingshot: "${name}" claims a gait but the base request is "${tel.base}"`);
  }
  if (want.state && tel.state !== want.state) {
    throw new Error(`swingshot: "${name}" claims state ${want.state}, got ${tel.state}`);
  }
  const uri = await page.evaluate(() => window.__GAME.capture('image/png'));
  await page.evaluate(() => {
    const e = window.__ENGINE;
    const rec = e._ordered.find((x) => x.key === 'camera');
    if (rec && window.__camMuted) { rec.mod.update = window.__camMuted; window.__camMuted = null; }
  });
  await writeFile(`${OUT}/${name}.png`, Buffer.from(uri.split(',')[1], 'base64'));
  rows.push({ frame: name, ...tel });
  const cr = tel.crookRing;
  console.log(`  -> ${name}.png  clip ${tel.clip.name} w${tel.clip.w}  state ${tel.state}  base ${tel.base}  `
    + `dev ${tel.dev?.toFixed?.(1)}°  pos ${tel.pos.map((v) => v.toFixed(2))}`);
  if (cr) console.log(`     crook->ring ${cr.worldM} m world · ${cr.px} px in frame (${cr.frameM} frame-m at ${cr.pxPerM} px/m)`);
  console.log(`     CAM ${tel.camPos.map((v) => v.toFixed(4)).join(' ')}  LOOK ${tel.lookAt.map((v) => v.toFixed(4)).join(' ')}`);
  return tel;
}

/** Fall onto hook-main-3 and catch it — poleshot's own §435.4-shaped entry. */
async function catchRing() {
  const at = await page.evaluate(([x, y, z]) => {
    const e = window.__ENGINE, m = e.get('movement');
    m.teleport({ x: x + 0.35, y: y + 10.5, z }, 0);
    m.velocity.set(0, 0, 0); m.grounded = false; m.sm.set('fall');
    for (let i = 0; i < 200; i++) {
      window.__driveStep(1, 1 / 60, { my: 0 });
      if (m.stateName === 'hookSwing') return i;
    }
    return -1;
  }, [RING.x, RING.y, RING.z]);
  if (at < 0) throw new Error('swingshot: the ring was never caught in the browser');
  return at;
}

/** Walk up the far-west dune until the fall-state skim has held the apex window > 0.7 s. */
async function surfDune() {
  return page.evaluate(([dx, dz, ux, uz]) => {
    const e = window.__ENGINE, m = e.get('movement');
    const g = e.get('collision').groundCheck({ x: dx, y: 80, z: dz, clone() { return { ...this }; } }, 0.34, 170)
      || { y: 3.4 };
    m.teleport({ x: dx, y: (g.y ?? 3.4) + 1.0, z: dz }, Math.atan2(ux, uz));
    m.velocity.set(0, 0, 0);
    window.__driveStep(45, 1 / 60, { my: 0 });
    let inWin = 0;
    for (let i = 0; i < 420; i++) {
      window.__driveStep(1, 1 / 60, { my: 1, aimAt: [m.position.x + ux * 30, 0, m.position.z + uz * 30] });
      const apex = m.stateName === 'fall' && Math.abs(m.velocity.y) < 2.2;
      inWin = apex ? inWin + 1 : 0;
      if (inWin > 42) return { i, pos: [m.position.x, m.position.y, m.position.z] };
    }
    return null;
  }, [DUNE.x, DUNE.z, DUNE.up.x, DUNE.up.z]);
}

try {
  /* ══ ARM A, default: the pinned swing ═══════════════════════════════════════════════════ */
  await boot();
  const tokens = await page.evaluate(async () => {
    const C = await import('/src/player/Controller.js');
    const M = await import('/src/player/Moveset.js');
    return { SWING_PINNED: C.SWING_PINNED, SURF_GAIT: M.SURF_GAIT };
  });
  console.log(`[swingshot] default arm tokens: SWING_PINNED ${tokens.SWING_PINNED} SURF_GAIT ${tokens.SURF_GAIT}`);
  let at = await catchRing();
  console.log(`[swingshot] caught at frame ${at}`);
  /* let the catch retire into the hang, then pump toward the next ring in the chain */
  await page.evaluate(() => window.__driveStep(50, 1 / 60, { my: 0 }));
  const pump = { my: 1, aimAt: [1.0, 0, -3.0] };
  const eA = await page.evaluate((c) => window.__toExtreme(400, c, 18), pump);
  if (!eA || eA.lost) throw new Error(`swingshot: never reached extreme A (${JSON.stringify(eA)})`);
  console.log(`[swingshot] extreme A after ${eA.i} frames, deviation ${eA.dev}°, side ${eA.side}`);
  await snap('swing-extremeA-front34', 35, { clip: 'hook_swing', state: 'hookSwing' }, { r: 5.2, up: 2.0, lookUp: 1.4 });
  await snap('swing-extremeA-profile', 90, { clip: 'hook_swing', state: 'hookSwing' }, { r: 5.2, up: 2.0, lookUp: 1.4 });
  const eB = await page.evaluate((c) => window.__toExtreme(400, c, 18), pump);
  if (!eB || eB.lost) throw new Error(`swingshot: never reached extreme B (${JSON.stringify(eB)})`);
  console.log(`[swingshot] extreme B after ${eB.i} more frames, deviation ${eB.dev}°, side ${eB.side}`);
  if (eA.side === eB.side) console.log('[swingshot] WARNING: both extremes on one side — the arc did not cross');
  await snap('swing-extremeB-front34', 35, { clip: 'hook_swing', state: 'hookSwing' }, { r: 5.2, up: 2.0, lookUp: 1.4 });
  await snap('swing-extremeB-profile', 90, { clip: 'hook_swing', state: 'hookSwing' }, { r: 5.2, up: 2.0, lookUp: 1.4 });

  /* containment: the same swing under the game's OWN camera (§475's standing instruction).
     Fresh catch so the rig tracks the whole beat, 300 pumped frames, the drawn body's root and
     head projected per frame through the LIVE camera. */
  at = await catchRing();
  const contain = await page.evaluate(async (c) => {
    const e = window.__ENGINE;
    const m = e.get('movement'), ch = e.get('character');
    let out = 0, maxRun = 0, run = 0, frames = 0;
    for (let i = 0; i < 300; i++) {
      window.__driveStep(1, 1 / 60, c);
      if (m.stateName !== 'hookSwing') break;
      frames++;
      ch.root.updateMatrixWorld(true);
      const head = ch.root.position.clone(); head.y += 1.4;
      const pts = [ch.root.position.clone(), head];
      let vis = false;
      for (const p of pts) {
        const q = p.project(e.camera);
        if (Math.abs(q.x) <= 1 && Math.abs(q.y) <= 1 && q.z < 1) { vis = true; break; }
      }
      if (!vis) { out++; run++; maxRun = Math.max(maxRun, run); } else run = 0;
    }
    return { frames, out, maxRun };
  }, pump);
  console.log(`[swingshot] §475 containment under the live camera: ${contain.frames} swing frames · `
    + `out ${contain.out} (max run ${contain.maxRun})`);
  const eC = await page.evaluate((c) => window.__toExtreme(400, c, 18), pump);
  if (eC && !eC.lost) await snap('swing-livecam', 0, { clip: 'hook_swing', state: 'hookSwing' }, { liveCam: true });

  /* the release, measured where the ring-teleport fix measured it: max drawn-root step */
  const preRel = await page.evaluate(() => window.__state());
  if (preRel.state !== 'hookSwing') throw new Error(`swingshot: release drive started in ${preRel.state}`);
  /* Through `Input._press`/`_release` — the seam every real device path (key, pad, mouse) calls,
     with §468's edge stamp applied by the module itself. NOT a Playwright key event and NOT a poke
     of the private maps: `?shot=1` runs with `input.enabled` false, so `_onKeyDown` returns before
     `_press` (measured: a real Space never released the swing), and a hand-written `_down` +
     `_pressedFrame` poke was wiped by the next `beginFrame`'s device fold (measured likewise). */
  const rel = await page.evaluate(() => {
    const e = window.__ENGINE, m = e.get('movement'), ch = e.get('character');
    const inp = e.input;
    const prev = ch.root.position.clone();
    let maxStep = 0;
    const states = [m.stateName];
    inp._press('jump', 'key');
    for (let i = 0; i < 32; i++) {
      window.__driveStep(1, 1 / 60, { my: 0 });
      if (i === 1) inp._release('jump', 'key');
      const s = ch.root.position.distanceTo(prev);
      if (s > maxStep) maxStep = s;
      prev.copy(ch.root.position);
      if (m.stateName !== states[states.length - 1]) states.push(m.stateName);
    }
    return { maxStep: +maxStep.toFixed(4), states, w: m._swingW };
  });
  /* the first draft measured from a SECOND evaluate, after the release had already happened in
     the first one, and then demanded a transition it had itself consumed — the throw was the
     instrument's own off-by-one, the same shape §720.5 records for the mount filter. */
  if (rel.states[0] !== 'hookSwing' || rel.states.length < 2) {
    throw new Error(`swingshot: the press never released the swing (states ${rel.states.join('->')})`);
  }
  console.log(`[swingshot] release: states ${rel.states.join('->')} · max drawn-root step over the `
    + `32 frames from the press ${rel.maxStep} m · pin weight at end ${rel.w}`);

  /* ══ ARM A, `?swing=loose` — the revert, through the URL ════════════════════════════════ */
  await boot('&swing=loose');
  const t2 = await page.evaluate(async () => {
    const C = await import('/src/player/Controller.js');
    return { SWING_PINNED: C.SWING_PINNED };
  });
  if (t2.SWING_PINNED !== false) throw new Error('swingshot: ?swing=loose did not reach the module');
  console.log(`[swingshot] ?swing=loose arm: SWING_PINNED ${t2.SWING_PINNED}`);
  at = await catchRing();
  await page.evaluate(() => window.__driveStep(50, 1 / 60, { my: 0 }));
  const eL = await page.evaluate((c) => window.__toExtreme(400, c, 18), pump);
  if (!eL || eL.lost) throw new Error(`swingshot: loose arm never reached an extreme (${JSON.stringify(eL)})`);
  console.log(`[swingshot] loose extreme after ${eL.i} frames, deviation ${eL.dev}°`);
  await snap('swing-loose-extreme-front34', 35, { clip: 'hook_swing', state: 'hookSwing' }, { r: 5.2, up: 2.0, lookUp: 1.4 });
  await snap('swing-loose-extreme-profile', 90, { clip: 'hook_swing', state: 'hookSwing' }, { r: 5.2, up: 2.0, lookUp: 1.4 });

  /* ══ ARM B, default: the dune climb shows the gait ═══════════════════════════════════════ */
  await boot();
  let surf = await surfDune();
  if (!surf) throw new Error('swingshot: the dune drive never produced the sustained skim');
  console.log(`[swingshot] dune skim established at drive frame ${surf.i}, pos ${surf.pos.map((v) => v.toFixed(1))}`);
  await snap('slope-gait-a-front34', 35, { clip: '(tree)', base: true, state: 'fall' }, { r: 3.0, up: 3.6, lookUp: 0.7 });
  await page.evaluate(([ux, uz]) => window.__driveStep(18, 1 / 60,
    { my: 1, aimAt: [window.__ENGINE.get('movement').position.x + ux * 30, 0, window.__ENGINE.get('movement').position.z + uz * 30] }),
  [DUNE.up.x, DUNE.up.z]);
  await snap('slope-gait-b-front34', 35, { clip: '(tree)', base: true, state: 'fall' }, { r: 3.0, up: 3.6, lookUp: 0.7 });

  /* ══ ARM B, `?surf=apex` — the shipped freeze, reproduced on camera ═════════════════════ */
  await boot('&surf=apex');
  const t3 = await page.evaluate(async () => {
    const M = await import('/src/player/Moveset.js');
    return { SURF_GAIT: M.SURF_GAIT };
  });
  if (t3.SURF_GAIT !== false) throw new Error('swingshot: ?surf=apex did not reach the module');
  console.log(`[swingshot] ?surf=apex arm: SURF_GAIT ${t3.SURF_GAIT}`);
  surf = await surfDune();
  if (!surf) throw new Error('swingshot: the apex-arm dune drive never produced the skim');
  console.log(`[swingshot] apex-arm skim at drive frame ${surf.i}, pos ${surf.pos.map((v) => v.toFixed(1))}`);
  await snap('slope-apex-a-front34', 35, { clip: 'jump_apex', state: 'fall' }, { r: 3.0, up: 3.6, lookUp: 0.7 });
  await page.evaluate(([ux, uz]) => window.__driveStep(18, 1 / 60,
    { my: 1, aimAt: [window.__ENGINE.get('movement').position.x + ux * 30, 0, window.__ENGINE.get('movement').position.z + uz * 30] }),
  [DUNE.up.x, DUNE.up.z]);
  await snap('slope-apex-b-front34', 35, { clip: 'jump_apex', state: 'fall' }, { r: 3.0, up: 3.6, lookUp: 0.7 });

  const bad = errs.filter((e) => !/kaykit|Failed to load resource/i.test(e));
  console.log(`\n[swingshot] ${rows.length} frames, errs ${bad.length}`);
  if (bad.length) console.log(bad.slice(0, 8).map((e) => `   ! ${e}`).join('\n'));
} finally {
  await browser.close().catch(() => {});
  server.kill('SIGTERM');
  release();
}

/* ── the cameras the shutters ACTUALLY used, re-run through camDot (§720.10's rule) ───────── */
console.log('\n[swingshot] camDot RE-RUN on the shutter cameras');
for (const r of rows) {
  const res = await camDot(r.camPos, r.lookAt);
  console.log(`  ${r.frame.padEnd(28)} enclosed ${res.near}/${res.dirs}  nearest ${res.nearest} m  `
    + `forward ${res.forward} m (${res.forwardName})  subject at ${res.targetLen} m  -> ${res.ok ? 'ok' : 'REFUSE'}`);
}

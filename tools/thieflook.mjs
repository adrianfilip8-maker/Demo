#!/usr/bin/env node
/**
 * thieflook.mjs — the first frames anyone has taken of the §495 thief lines, rig live.
 *
 * `tests/thiefspots.test.mjs` drove all three lines headless before they shipped, and its own
 * DOMAIN block names the gap this tool exists for: *"It also cannot see art — a proxy with no
 * visible rope would pass."* Nobody has looked. The coordinator's brief for this pass:
 *
 *   1. frames of each beat — approach, traverse, exit — with the CameraRig in charge,
 *      two samples per claim (§466.5);
 *   2. readability: does the spot telegraph as usable before you're on it? The mark itself is
 *      DOM (HUD `el.lock`), so it can never appear in a framebuffer capture — it is verified
 *      here at the mechanism instead (§439): the probe records the `telegraph` bus event the
 *      HUD consumes, plus the rig's own `_routeUpW`/`_routeSideW` reveal weights;
 *   3. the tightrope rides as `railSlide` — the first real route the `rail_slide` framing has
 *      ever had (item 6 of HARDWARE-REVIEW: "if a route is ever given a rail, look at that row
 *      first"). The probe logs the DELIVERED lead per frame — signed horizontal projection of
 *      (pivot − player) along travel, the same quantity §450.1's census pins — so the 1.772 m
 *      steady-state number can be compared with what the rope's own speeds actually produce.
 *
 * Input scripts are transplants of the thiefspots drives (hold W = move.y 1, E pulses = the
 * interact cadence, Space spans = the held jump), not new choreography — the drive that shipped
 * the lines is the drive that photographs them.
 *
 *   OUT=/abs/path W=1920 H=1080 Q=high SEQ=t1,t2,t3 node tools/thieflook.mjs
 *
 * Same FIFO capture lock as camlook/shot; sim frames are free (camlook's fast-step), captures
 * pay for the render. ~25 captures ≈ 15–25 min at 1080p on SwiftShader.
 */
import { chromium } from 'playwright';
import { acquire } from './lock.mjs';
import { spawn, execFileSync } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import net from 'node:net';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const OUT = process.env.OUT || `${ROOT}/shots`;
const W = Number(process.env.W || 1920), H = Number(process.env.H || 1080);
const Q = process.env.Q || 'high';
const PRE = process.env.PRE || 'thief1';
const SEQ = (process.env.SEQ || 't1,t2,t3').split(',');
const seq = (k) => SEQ.includes(k);
const PI = Math.PI;

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
const release = await acquire('look3-thief');
console.log(`[thief] lock · sha ${sha}${dirty ? ` · DIRTY\n${dirty}` : ' · clean'}`);

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
  console.log('[thief] ready');
  await page.evaluate(() => {
    const e = window.__ENGINE;
    e.stopLoop();
    window.__GAME.hideHud(true);
    e.debug.freeCam = false;               // the rig keeps the camera — that is the whole point
    e.input.locked = true;                 // keyboard-only run, but keep camlook's regime
    /* The telegraph mark is a DOM element and can never be in a framebuffer capture, so record
       the bus event the HUD consumes — the same resolution logic as HUD.setTelegraph, so this
       probe and the mark cannot disagree about what counts as a point. */
    window.__tele = null;
    e.on('telegraph', (p) => {
      const pt = p?.pos ?? p?.point ?? p?.position ?? (p?.isVector3 ? p : null);
      window.__tele = (pt && typeof pt.x === 'number')
        ? [+pt.x.toFixed(2), +pt.y.toFixed(2), +pt.z.toFixed(2)] : null;
    });
    /* camlook's fast sim step, verbatim: pump input.beginFrame (held keys become move vectors
       there), advance every module, render nothing. Pixels are paid for only in capture(). */
    window.__simStep = (n, dt) => {
      for (let i = 0; i < n; i++) {
        e.input?.beginFrame?.();
        e.dt = Math.min(dt, 1 / 20) * e.timeScale;
        if (e.debug.paused || e.paused) e.dt = 0;
        e.time += e.dt; e.frame++;
        for (const { key, mod } of e._ordered) {
          if (typeof mod.update === 'function') { try { mod.update(e.dt, e.time); } catch {} }
        }
      }
    };
  });

  const probe = () => page.evaluate(() => {
    const e = window.__ENGINE, m = e.get('movement'), c = e.get('camera');
    const ch = e.get('character');
    let ndc = null;
    if (ch?.root) {
      const pos = ch.root.position.clone(); pos.y += 0.9;
      const v = pos.project(e.camera);
      ndc = [+v.x.toFixed(2), +v.y.toFixed(2), +v.z.toFixed(2)];
    }
    /* Delivered lead, live: signed horizontal projection of (pivot − player) on travel — the
       §450.1 census quantity, measured on the real route instead of at a pinned speed. */
    const vx = m.velocity.x, vz = m.velocity.z, sp = Math.hypot(vx, vz);
    const lead = sp > 0.05
      ? +(((c.pivot.x - m.position.x) * vx + (c.pivot.z - m.position.z) * vz) / sp).toFixed(3)
      : null;
    return {
      st: m?.stateName, gr: !!m?.grounded,
      p: [+m.position.x.toFixed(2), +m.position.y.toFixed(2), +m.position.z.toFixed(2)],
      sp: +sp.toFixed(2), vy: +m.velocity.y.toFixed(2),
      rsp: m?.rail ? +(m.rail.speed || 0).toFixed(2) : undefined,
      key: c?._frameKey, boom: +(c?.boom ?? 0).toFixed(3), fov: +(e.camera.fov).toFixed(2),
      lead,
      up: +(c?._routeUpW ?? 0).toFixed(3), side: +(c?._routeSideW ?? 0).toFixed(3),
      tele: window.__tele,
      cam: [+e.camera.position.x.toFixed(2), +e.camera.position.y.toFixed(2), +e.camera.position.z.toFixed(2)],
      ndc, vis: ch?.root ? ch.root.visible !== false : null,
    };
  });
  const sim = (n = 1) => page.evaluate((k) => window.__simStep(k, 1 / 60), n);
  const snap = async (name, tag) => {
    const s = await probe();
    log.push({ tag: tag || name, frame: name, ...s });
    const uri = await page.evaluate(() => window.__GAME.capture('image/png'));
    await writeFile(`${OUT}/${PRE}-${name}.png`, Buffer.from(uri.split(',')[1], 'base64'));
    console.log(`      -> ${PRE}-${name}.png  ${JSON.stringify(s)}`);
  };
  const trace = (tag, s) => log.push({ tag, ...s });
  /* Teleport through the Controller's own API (re-anchors its watchdog and the rig snaps on the
     jump); fall back to a raw position write for any build without it. */
  const tp = (x, y, z, yaw) => page.evaluate(([a, b, c, d]) => {
    const m = window.__ENGINE.get('movement');
    if (typeof m.teleport === 'function') { m.position.set(a, b, c); m.teleport(m.position.clone ? m.position.clone() : { x: a, y: b, z: c }, d); }
    else { m.position.set(a, b, c); m.velocity.set(0, 0, 0); if ('yaw' in m) m.yaw = d; }
  }, [x, y, z, yaw]);
  const setCam = (yaw) => page.evaluate((y) => {
    const c = window.__ENGINE.get('camera');
    c.yaw = y; c.snap(false);
  }, yaw);
  const keysUp = async () => {
    for (const k of ['KeyW', 'Space', 'KeyE', 'ShiftLeft']) await page.keyboard.up(k).catch(() => {});
  };
  /* First candidate stance that is grounded after the settle wins; every reject is recorded.
     A guessed coordinate that happens to be air or wall must not become a silent "the approach
     looks wrong" frame — the smoke run's T1 stood on exactly that trap: the thiefspots start
     (2.3, 9.02, 13.0) is AIR (the lintel band is at z ≈ 13.85) and the headless arm only works
     because its retry loop climbs back to the real lintel. Yaw faces `target` per candidate. */
  const stance = async (tag, cands, target, settle = 25) => {
    for (const [x, y, z] of cands) {
      const yaw = Math.atan2(target[0] - x, target[1] - z);
      await tp(x, y, z, yaw); await sim(2); await setCam(yaw); await sim(settle);
      const s = await probe();
      if (s.gr && Math.abs(s.p[1] - y) < 1.2) { trace(`${tag}-stance-ok`, s); return s; }
      trace(`${tag}-stance-reject`, { want: [x, y, z], ...s });
    }
    return null;
  };

  const t0 = Date.now();
  await sim(30);
  const home = await probe();
  console.log(`[thief] spawn ${JSON.stringify(home)} (${((Date.now() - t0) / 1000).toFixed(1)}s)`);
  log.push({ tag: 'spawn', ...home });

  /* ── T2 runs FIRST because its opening frame must be the untouched spawn camera ─────────────
     §495.B claims the tightrope is "readable from the first camera" — that claim is only
     testable before any teleport has moved the player. */
  if (seq('t2')) {
    console.log('[T2] colossi tightrope — first camera, approach, then both entries, twice each');
    await snap('t2a-firstcam', 'T2');
    /* Walk the spawn approach toward the colossi; capture just before passing under the rope
       (z 27). The telegraph channels and the bus event are the readability record here. */
    await page.keyboard.down('KeyW');
    let under = false;
    for (let i = 0; i < 240; i++) {
      await sim(1);
      const s = await probe();
      if (i % 2 === 0) trace('T2-walkin', s);
      if (!under && s.p[2] < 27.9) { under = true; await snap('t2b-under', 'T2'); break; }
    }
    await page.keyboard.up('KeyW');
    if (!under) { console.log('      never reached the rope corridor'); log.push({ tag: 'T2-NOUNDER' }); }

    /* The rope has TWO entries and they are different beats, which the smoke run surfaced:
       an E-press within railMount×1.6 enters `RailSlide`, whose `enter()` mounts at
       `TUNE.railSpeed` 9.5 m/s regardless of approach speed — the tightrope plays as the rooftop
       rail circuit. A walk-on over the crest (0.11 above the stance, under stepHeight — §495.B's
       own authored mount) lands grounded on the `rail` tag, which is `RailWalk`'s entry: the
       own-power balance crossing, and `railWalk` routes to the `balance` framing via
       STATE_FRAME — the tightrope shot, which no drive anywhere has ever produced. Two takes of
       each entry; the E-takes track the overshoot at the east end all the way to whatever it
       ends in (the smoke run ended WEDGED airborne in the colossus at (8.33, 4.77), frozen in
       `fall`, until the watchdog respawned to spawn). */
    /* Take plan — the smoke runs redrew it, twice:
         1  E-press ride, full consequence chain: entry, mid, late (the delivered-lead frame at
            x ≈ +3, where the ride has settled to its ~1.73 m), off-end launch, the wedge, the
            watchdog respawn.
         3  E-press ride again with the press cadence phase-shifted — the ride is deterministic
            from the mount, so a genuine second sample needs a different mount frame.
         2  the walk-on §495.B authored ("rope crest 0.11 above the stance, under stepHeight") —
            the smoke run measured the knee top ENDING ~0.7 m west of the rope's west end: the
            walk steps off at x ≈ −7.2, drops to a lip at y 4.5, and never reaches the crest.
            Frames of the step-off and the lip are the evidence that the walk-on does not exist.
         4  the jump-on a player would try next — and RailSlide's airborne auto-engage
            (vy ≤ 0.6, within railMount) should steal the landing into the 9.5 m/s slide before
            the feet ever touch the crest, which would make railWalk structurally unreachable on
            this rope, not merely unvisited. */
    for (const take of [1, 3, 2, 4]) {
      const kind = take === 2 ? 'walk-on' : take === 4 ? 'jump-on' : 'E-press';
      console.log(`[T2.${take}] knee -> crossing (${kind})`);
      const st = await stance(`T2.${take}`,
        take === 3 ? [[-8.6, 5.5, 27.0], [-9.0, 5.5, 27.0]] : [[-9.0, 5.5, 27.0], [-8.6, 5.5, 27.0]],
        [9.0, 27.0], 25 + take * 7);
      if (!st) { log.push({ tag: `T2.${take}-NOSTANCE` }); continue; }
      if (take === 1) await snap('t2c-knee', 'T2.1');
      await page.keyboard.down('KeyW');
      await page.keyboard.down('ShiftLeft');
      let onRail = false, mid = false, dip = false, late = false, exited = false, offEnd = false, eDown = false;
      let walkedOff = false, lipShot = false, jumped = false, spaceHeld = 0;
      let stuckN = 0, stuckShot = false, lastP = null;
      for (let i = 0; i < 900; i++) {
        if (kind === 'E-press' && !onRail) {
          const phase = take === 3 ? 4 : 0;
          if (i % 9 === phase) { await page.keyboard.down('KeyE'); eDown = true; }
          else if (eDown && i % 9 === (phase + 2) % 9) { await page.keyboard.up('KeyE'); eDown = false; }
        }
        await sim(1);
        const s = await probe();
        trace(`T2.${take}-cross`, s);
        if (kind === 'jump-on' && !jumped && s.p[0] > -7.7 && s.gr) {
          jumped = true; spaceHeld = 4; await page.keyboard.down('Space');
        }
        if (spaceHeld > 0 && --spaceHeld === 0) await page.keyboard.up('Space');
        if (!onRail && (s.st === 'railWalk' || s.st === 'railSlide')) {
          onRail = true;
          log.push({ tag: `T2.${take}-ENTERED`, st: s.st, at: s.p, sp: s.sp, rsp: s.rsp });
          if (eDown) { await page.keyboard.up('KeyE'); eDown = false; }
          await sim(2); await snap(`t2t${take}-entry`, `T2.${take}`);
        }
        if (kind === 'walk-on' && !onRail) {
          if (!walkedOff && !s.gr && s.p[0] > -7.7) {
            walkedOff = true;
            log.push({ tag: 'T2.2-WALKOFF', at: s.p });
            await snap('t2t2-walkoff', 'T2.2');
          }
          if (walkedOff && !lipShot && s.gr && s.p[1] < 5.0) {
            lipShot = true; await snap('t2t2-lip', 'T2.2');
          }
        }
        if (onRail && !mid && s.p[0] > -4.5 && (s.st === 'railSlide' || s.st === 'railWalk')) {
          mid = true; await snap(`t2t${take}-mid`, `T2.${take}`);
        }
        /* The ndcY minimum: the smoke trace bottoms at −0.76 around x −1.9 (lead grown to ~+1.3
           while the boom is still short from the west-knee crush). The worst-framed instant of
           the ride is the frame item 6's "look at that row first" clause is answered on. */
        if (onRail && !dip && s.p[0] > -2.0 && (s.st === 'railSlide' || s.st === 'railWalk')
            && take === 1) {
          dip = true; await snap('t2t1-dip', 'T2.1');
        }
        if (onRail && !late && s.p[0] > 2.5 && (s.st === 'railSlide' || s.st === 'railWalk')
            && take === 1) {
          late = true; await snap('t2t1-late', 'T2.1');
        }
        if (onRail && !offEnd && s.p[0] > 6.4 && s.st !== 'railSlide' && s.st !== 'railWalk' && !s.gr) {
          offEnd = true;
          if (take === 1) await snap('t2t1-offend', 'T2.1');
        }
        /* A real dismount is a grounded frame AT KNEE HEIGHT — the smoke run's wedge produced
           one grounded flicker at y 4.77 and was miscounted as an exit. */
        if (onRail && s.gr && s.p[0] > 4.5 && s.p[1] > 5.2
            && ((s.st !== 'railSlide' && s.st !== 'railWalk') || s.p[0] > 5.8)) {
          await sim(3); await snap(`t2t${take}-exit`, `T2.${take}`); exited = true; break;
        }
        /* The wedge: airborne, position frozen. 45 identical frames is 0.75 s of a `fall` that
           does not fall — photograph it, then let it run to the watchdog respawn. */
        if (!s.gr && lastP && Math.abs(s.p[0] - lastP[0]) < 0.01 && Math.abs(s.p[1] - lastP[1]) < 0.01
            && Math.abs(s.p[2] - lastP[2]) < 0.01) {
          if (++stuckN === 45 && !stuckShot) {
            stuckShot = true;
            log.push({ tag: `T2.${take}-STUCK`, at: s.p, st: s.st });
            await snap(`t2t${take}-stuck`, `T2.${take}`);
          }
        } else stuckN = 0;
        lastP = s.p;
        if (s.p[1] < 3.0) {
          log.push({ tag: `T2.${take}-FELLBELOW`, at: s.p });
          if (take === 1) { await sim(5); await snap('t2t1-respawn', 'T2.1'); }
          break;
        }
      }
      if (eDown) await page.keyboard.up('KeyE');
      await keysUp();
      if (!onRail) log.push({ tag: `T2.${take}-NORAIL` });
      if (!exited) log.push({ tag: `T2.${take}-NOEXIT` });
      await sim(30);
    }
  }

  /* ── T1: the obelisk rope — lintel jump-grab, climb, top ──────────────────────────────── */
  if (seq('t1')) {
    console.log('[T1] obelisk rope — approach, jump-grab, climb, top, twice');
    /* Readability sample 1: ground level, the §8.1 approach side. Sample 2: the kiosk lintel
       stance the mount is authored from — the REAL lintel band at z ≈ 13.55-13.7, not the
       thiefspots start (2.3, 9.02, 13.0), which is air (see `stance`). */
    const g = await stance('T1-ground', [[6.5, 0.02, 19.5], [8.0, 0.02, 22.0], [4.0, 0.02, 24.0]],
      [0, 13.0]);
    if (g) await snap('t1a-ground', 'T1');
    const LINTEL = [[2.3, 9.02, 13.55], [2.5, 9.02, 13.65], [2.3, 9.02, 13.75], [2.3, 9.02, 13.0]];
    for (const take of [1, 2]) {
      console.log(`[T1.${take}] lintel -> rope`);
      const st = await stance(`T1.${take}`,
        take === 1 ? LINTEL : LINTEL.slice(1).concat(LINTEL.slice(0, 1)),
        [0, 13.0], 25 + take * 7);
      if (!st) { log.push({ tag: `T1.${take}-NOSTANCE` }); continue; }
      const at = st.p;
      const yawBack = Math.atan2(0 - at[0], 13.0 - at[2]);
      if (take === 1) await snap('t1b-lintel', 'T1.1');
      let mounted = false;
      for (let att = 0; att < 3 && !mounted; att++) {
        if (att > 0) {
          await keysUp();
          await tp(at[0], 9.02, at[2], yawBack); await sim(2); await setCam(yawBack); await sim(20);
          log.push({ tag: `T1.${take}-retry`, attempt: att });
        }
        await page.keyboard.down('KeyW');
        let eDown = false;
        for (let i = 0; i < 90; i++) {
          if (i === 4) await page.keyboard.down('Space');
          if (i === 18) await page.keyboard.up('Space');
          if (i > 6 && i % 5 === 0) { await page.keyboard.down('KeyE'); eDown = true; }
          else if (eDown && i % 5 === 2) { await page.keyboard.up('KeyE'); eDown = false; }
          await sim(1);
          const s = await probe();
          trace(`T1.${take}-mount`, s);
          if (s.st === 'poleClimb') { mounted = true; break; }
          if (s.p[1] < 7.5) break;                     // fell to the plinth — retry
        }
        if (eDown) { await page.keyboard.up('KeyE'); eDown = false; }
        await page.keyboard.up('Space').catch(() => {});
        if (!mounted) await page.keyboard.up('KeyW');
      }
      if (!mounted) { log.push({ tag: `T1.${take}-NOMOUNT` }); await keysUp(); continue; }
      await sim(2); await snap(`t1t${take}-mount`, `T1.${take}`);
      let midDone = false, topDone = false;
      for (let i = 0; i < 700; i++) {
        await sim(1);
        const s = await probe();
        if (i % 5 === 0) trace(`T1.${take}-climb`, s);
        if (!midDone && s.p[1] > 14.5) { midDone = true; await snap(`t1t${take}-climb`, `T1.${take}`); }
        if (s.p[1] > 19.6) { topDone = true; await snap(`t1t${take}-top`, `T1.${take}`); break; }
        if (s.st !== 'poleClimb') { log.push({ tag: `T1.${take}-LEFTCLIMB`, at: s.p, st: s.st }); break; }
      }
      if (!topDone) log.push({ tag: `T1.${take}-NOTOP` });
      await keysUp();
      await sim(30);
    }
  }

  /* ── T3: the SE drainpipe — walk-on mount, climb, top-hop onto the ring ───────────────── */
  if (seq('t3')) {
    console.log('[T3] SE drainpipe — approach, mount, climb, ring, twice');
    const far = await stance('T3-far', [[17.5, 0.02, -2.0], [18.5, 0.02, -2.0]], [21.35, -2.0]);
    if (far) await snap('t3a-far', 'T3');
    for (const take of [1, 2]) {
      console.log(`[T3.${take}] paving -> ring`);
      const st = await stance(`T3.${take}`,
        take === 1 ? [[19.8, 0.02, -2.0]] : [[19.5, 0.02, -2.1]],
        [21.35, -2.0], 25 + take * 7);
      if (!st) { log.push({ tag: `T3.${take}-NOSTANCE` }); continue; }
      if (take === 1) await snap('t3b-near', 'T3.1');
      await page.keyboard.down('KeyW');
      let mounted = false, midDone = false, hopped = false, arrived = false, eDown = false, spaceDown = false;
      for (let i = 0; i < 900; i++) {
        const s = await probe();
        if (!mounted) {
          if (i % 8 === 0) { await page.keyboard.down('KeyE'); eDown = true; }
          else if (eDown && i % 8 === 2) { await page.keyboard.up('KeyE'); eDown = false; }
          if (s.st === 'poleClimb') {
            mounted = true;
            if (eDown) { await page.keyboard.up('KeyE'); eDown = false; }
            await sim(2); await snap(`t3t${take}-mount`, `T3.${take}`);
          }
        } else if (s.st === 'poleClimb') {
          if (!midDone && s.p[1] > 5.0) { midDone = true; await snap(`t3t${take}-climb`, `T3.${take}`); }
          /* 9.30, not the test's 9.35: the top-out vault can fire between probes — the smoke run
             reached the ring without this press ever registering (held W vaults from the top). */
          if (s.p[1] >= 9.30 && !spaceDown) { await page.keyboard.down('Space'); spaceDown = true; }
        } else if (mounted && !s.gr && !hopped) {
          hopped = true;
          if (spaceDown) { await page.keyboard.up('Space'); spaceDown = false; }
          if (take === 1) await snap(`t3t${take}-hop`, `T3.${take}`);
        }
        if (mounted && s.gr && s.p[1] > 8.6 && s.p[0] > 21.7) {
          await sim(3); await snap(`t3t${take}-ring`, `T3.${take}`);
          /* And the settled frame: the impact frame 3 frames after touchdown is mid-recovery —
             the smoke run's was boom 0.55 (hard-min) with the subject behind the camera. Keys up
             FIRST: the second smoke left W held through the settle and photographed 45 frames of
             continued walking (take 2 walked off the ring's far side into a hazard) instead of
             the arrival a player would be standing in. */
          await keysUp();
          await sim(40); await snap(`t3t${take}-ring2`, `T3.${take}`);
          arrived = true; break;
        }
        trace(`T3.${take}-run`, s);
        await sim(1);
      }
      if (eDown) await page.keyboard.up('KeyE');
      if (spaceDown) await page.keyboard.up('Space');
      await keysUp();
      if (!mounted) log.push({ tag: `T3.${take}-NOMOUNT` });
      if (!arrived) log.push({ tag: `T3.${take}-NORING` });
      await sim(30);
    }
  }
} finally {
  await writeFile(`${OUT}/${PRE}-telemetry.json`, JSON.stringify({ sha, dirty, W, H, Q, errs, log }, null, 2));
  await browser.close();
  server.kill('SIGTERM');
  release();
  console.log('[thief] released');
  if (errs.length) console.log(`[thief] page errors:\n${errs.slice(0, 8).join('\n')}`);
}

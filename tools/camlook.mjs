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
 *   S0  stand -> move -> stop  — the boom-chain collapse (sheet item 2): life or noise
 *   S1  run, jump, land, TWICE — the `land` framing, 6% -> 52%; two takes because §466.5
 *   S2  slam from a hop        — a jump-apex Cane Slam
 *   S3  slam from 16 m         — the same move from height; S2 vs S3 is sheet item 3
 *   S4  cane combo, two swings — the `combat` framing, 35% -> 73%
 *   S5  same pose, two times of day — is the cold masonry a grade or a cast (§4 precedent)
 *
 * Sim frames are FREE here (module updates without the render — see the fast-step block), so
 * sequences pay only per captured frame: ~20 captures is ~10 minutes at 1080p on SwiftShader.
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
const W = Number(process.env.W || 1920), H = Number(process.env.H || 1080);
const Q = process.env.Q || 'high';
/* SEQ=s1,s3 runs only those sequences. The lock is FIFO and shared; a rerun that repeats nine
   already-captured frames holds it ~10 minutes for nothing. */
const SEQ = (process.env.SEQ || 's0,s1,s2,s3,s4,s5').split(',');
const seq = (k) => SEQ.includes(k);

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
    /* Without this, EVERY mouse press in this harness is consumed as the pointer-lock
       acquisition click: `Input._onMouseDown` swallows an unlocked left click whenever
       `requestPointerLock` exists, and headless Chromium never grants the lock, so `locked`
       stays false and the swallow repeats forever. Both Cane Slam sequences of runs 2 and 3
       captured plain falls because of it — proven by slamtrace's fall arm matching the run-3
       telemetry to the digit (§467). Forcing `locked` makes a click reach `_press('attack')`,
       and the §468 stamp fix makes the edge visible to the next sim frame. */
    window.__ENGINE.input.locked = true;
  });

  const probe = () => page.evaluate(() => {
    const e = window.__ENGINE, m = e.get('movement'), c = e.get('camera');
    /* The subject block exists because three impact captures in a row contained no character and
       every derivation of "where is he" from boom+state alone was a guess. cam/ndc/vis/span make
       the frame self-describing: where the lens is, where the projection puts him, whether his
       root is visible, and how large his skinned mesh's world box actually is — a bone-collapse
       renders as a degenerate span, which no amount of camera telemetry would show. */
    const ch = e.get('character');
    let ndc = null, span = null;
    if (ch?.root) {
      const pos = ch.root.position.clone(); pos.y += 0.9;
      const v = pos.project(e.camera);
      ndc = [+v.x.toFixed(2), +v.y.toFixed(2), +v.z.toFixed(2)];
      /* Bone world-position spread, not Box3: window.THREE is not exposed to the page, and the
         skeleton is the thing a collapse actually happens to. A healthy pose spans ~0.5-1.8 m;
         a bone-collapse reads as ~0. */
      try {
        const bones = ch.bones ? Object.values(ch.bones) : [];
        if (bones.length) {
          let mn = [1e9, 1e9, 1e9], mx = [-1e9, -1e9, -1e9];
          const w = pos.constructor ? new pos.constructor() : null;
          for (const b of bones) {
            b.getWorldPosition(w);
            mn = [Math.min(mn[0], w.x), Math.min(mn[1], w.y), Math.min(mn[2], w.z)];
            mx = [Math.max(mx[0], w.x), Math.max(mx[1], w.y), Math.max(mx[2], w.z)];
          }
          span = [+(mx[0] - mn[0]).toFixed(2), +(mx[1] - mn[1]).toFixed(2), +(mx[2] - mn[2]).toFixed(2)];
        }
      } catch { span = 'bones-failed'; }
    }
    return {
      st: m?.stateName, gr: !!m?.grounded,
      p: [+m.position.x.toFixed(2), +m.position.y.toFixed(2), +m.position.z.toFixed(2)],
      v: [+m.velocity.x.toFixed(2), +m.velocity.y.toFixed(2), +m.velocity.z.toFixed(2)],
      key: c?._frameKey, boom: +(c?.boom ?? 0).toFixed(3), fov: +(e.camera.fov).toFixed(2),
      on: !!c?._clampOn,
      roll: +(c?._roll ?? 0).toFixed(4),
      cam: [+e.camera.position.x.toFixed(2), +e.camera.position.y.toFixed(2), +e.camera.position.z.toFixed(2)],
      ndc, vis: ch?.root ? ch.root.visible !== false : null, span,
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

  /* ── FAST SIM STEP ─────────────────────────────────────────────────────────────────────────
     `renderFrame` runs the module update loop AND the postfx render, and on this container's
     software rasteriser the render is ~all of the cost. The sim and the render are separable —
     `renderFrame` is literally "for (mod of _ordered) mod.update(dt)" followed by "postfx.render"
     — so this harness advances the sim without rendering and pays for pixels only on captured
     frames (`capture()` itself calls `renderFrame(0)`, which renders exactly once). A 300-frame
     sequence goes from minutes to milliseconds, which is what makes 1920×1080 affordable. */
  await page.evaluate(() => {
    const e = window.__ENGINE;
    window.__simStep = (n, dt) => {
      for (let i = 0; i < n; i++) {
        /* main.js wraps engine.renderFrame to pump input.beginFrame() before the module loop —
           the wrapper is where held keys become move vectors and edge events. A sim step that
           skips it advances the world and leaves the player deaf: the first run of this harness
           produced a pixel-identical Sly across 12 frames of held W while the pickups animated,
           which is exactly that failure. Replicate the pump, not just the module loop. */
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
  const sim = (n = 1) => page.evaluate((k) => window.__simStep(k, 1 / 60), n);

  const t0 = Date.now();
  await sim(30);
  const home = await probe();
  console.log(`[look] spawn ${JSON.stringify(home)} (30 sim frames in ${((Date.now() - t0) / 1000).toFixed(1)}s)`);
  log.push({ tag: 'spawn', ...home });

  /** Capture with telemetry attached, so every frame is tied to the framing that produced it. */
  const snap = async (name, tag) => {
    const s = await probe();
    log.push({ tag: tag || name, frame: name, ...s });
    const uri = await page.evaluate(() => window.__GAME.capture('image/png'));
    await writeFile(`${OUT}/${name}.png`, Buffer.from(uri.split(',')[1], 'base64'));
    console.log(`      -> ${name}.png  ${JSON.stringify(s)}`);
  };

  /* ---- S0: the boom collapse, seen — stand, move, stop -------------------- */
  if (seq('s0')) {
  console.log('[S0] stand -> move -> stop (the boom-chain collapse, item 2)');
  await snap('s0-stand', 'S0');
  await page.keyboard.down('KeyW');
  await sim(12); await snap('s0-move12', 'S0');
  await sim(38); await snap('s0-move50', 'S0');
  await page.keyboard.up('KeyW');
  await sim(5); await snap('s0-stop5', 'S0');
  await sim(15); await snap('s0-stop20', 'S0');
  await sim(30);
  }

  /* ---- S1: run, jump, land — twice (§466.5: one sample is not evidence) --- */
  for (const take of (seq('s1') ? [1, 2] : [])) {
    console.log(`[S1.${take}] run + jump + land`);
    /* +10 z: the spawn courtyard's staircase begins ~6 m ahead of home along the run direction,
       and the first run's S2 slammed into it with the camera ending inside drawn stone. Open
       desert is behind spawn; starting 10 m back keeps the whole jump arc over flat ground. */
    await page.evaluate(([x, y, z]) => {
      const m = window.__ENGINE.get('movement');
      m.position.set(x, y, z + 10); m.velocity.set(0, 0, 0);
    }, home.p);
    await sim(20);
    await page.keyboard.down('KeyW');
    await sim(30 + take * 10);
    /* HOLD the jump through the ascent. A 3-frame tap is a jump-cut hop that arrives under
       `landBeat` 3.2 m/s, and `Jump.update` then returns `move` directly — NO `land` state exists
       for a soft landing with the stick held. Both takes of the first 1080p run failed exactly
       that way ("NEVER LANDED"), which was this driver shaping the quantity it was pointed at
       (§464, third instance). A held jump arrives ~10.8 m/s and lands for real. */
    await page.keyboard.down('Space'); await sim(16); await page.keyboard.up('Space');
    let iLand = -1, last = null;
    for (let i = 0; i < 90; i++) {
      await sim(1);
      const s = await probe();
      last = s;
      if (s.st === 'land') { iLand = i; break; }
    }
    if (iLand < 0) console.log(`      last probe: ${JSON.stringify(last)}`);
    if (iLand >= 0) {
      await snap(`s1t${take}-land0`, `S1.${take}`);
      await sim(3); await snap(`s1t${take}-land3`, `S1.${take}`);
      await sim(5); await snap(`s1t${take}-land8`, `S1.${take}`);
    } else {
      console.log('      NEVER LANDED — recorded, not silently skipped');
      log.push({ tag: `S1.${take}-NOLAND` });
    }
    await page.keyboard.up('KeyW');
    await sim(30);
  }

  /* ---- S2/S3: the Cane Slam pair (sheet item 3) --------------------------- */
  if (seq('s2')) {
  console.log('[S2] cane slam from a jump apex');
  await page.evaluate(([x, y, z]) => {
    const m = window.__ENGINE.get('movement');
    m.position.set(x, y, z + 10); m.velocity.set(0, 0, 0);   // open ground — see S1
  }, home.p);
  await sim(20);
  await page.keyboard.down('KeyW'); await sim(40);
  await page.keyboard.down('Space'); await sim(3); await page.keyboard.up('Space');
  await sim(11);
  await page.mouse.down({ button: 'left' }); await sim(2); await page.mouse.up({ button: 'left' });
  /* The press check the first three runs did not have, and paid for: runs 2 and 3 captured
     "slams" that were plain falls (the lock swallow ate the click; §467/§468). An instrument
     that stages a move must verify the move began, not just that something later hit the
     ground — DiveAttack cuts vx/z to 70 % and pins vy, so a missed press is invisible from
     the impact numbers alone. */
  {
    const s = await probe();
    if (s.st !== 'dive') { console.log(`      ATTACK DID NOT REGISTER (st ${s.st})`); log.push({ tag: 'S2-NODIVE', st: s.st }); }
  }
  let hit = -1;
  for (let i = 0; i < 60; i++) {
    await sim(1);
    const s = await probe();
    if (s.gr && s.st !== 'dive') { hit = i; break; }
  }
  await page.keyboard.up('KeyW');
  if (hit >= 0) { await snap('s2-hop-impact0', 'S2'); await sim(4); await snap('s2-hop-impact4', 'S2'); }
  else { console.log('      slam-from-hop never impacted'); log.push({ tag: 'S2-NOIMPACT' }); }
  await sim(30);
  }

  if (seq('s3')) {
  console.log('[S3] cane slam from 16 m');
  await page.evaluate(([x, y, z]) => {
    const m = window.__ENGINE.get('movement');
    m.position.set(x, y + 16, z); m.velocity.set(0, 0, 0);
  }, home.p);
  await sim(14);
  await page.mouse.down({ button: 'left' }); await sim(2); await page.mouse.up({ button: 'left' });
  { // same press check as S2 — see the comment there
    const s = await probe();
    if (s.st !== 'dive') { console.log(`      ATTACK DID NOT REGISTER (st ${s.st})`); log.push({ tag: 'S3-NODIVE', st: s.st }); }
  }
  /* `let`, not a reuse: S2's `hit` lives inside S2's `if (seq(...))` block since the SEQ filter
     wrapped each sequence. Assigning to it from here is a strict-mode ReferenceError the moment
     S3 runs — which no run before run 3 did, because reruns filtered to earlier sequences. */
  let hit = -1;
  for (let i = 0; i < 90; i++) {
    await sim(1);
    const s = await probe();
    if (s.gr && s.st !== 'dive') { hit = i; break; }
  }
  if (hit >= 0) { await snap('s3-high-impact0', 'S3'); await sim(4); await snap('s3-high-impact4', 'S3'); }
  else { console.log('      slam-from-height never impacted'); log.push({ tag: 'S3-NOIMPACT' }); }
  await sim(30);
  }

  /* ---- S4: cane combo (the combat framing, 35% -> 73%) -------------------- */
  if (seq('s4')) {
  console.log('[S4] cane combo, two swings');
  await page.evaluate(([x, y, z]) => {
    const m = window.__ENGINE.get('movement');
    m.position.set(x, y, z); m.velocity.set(0, 0, 0);
  }, home.p);
  await sim(20);
  await page.mouse.down({ button: 'left' }); await sim(2); await page.mouse.up({ button: 'left' });
  await sim(5); await snap('s4-combo-swing1', 'S4');
  await page.mouse.down({ button: 'left' }); await sim(2); await page.mouse.up({ button: 'left' });
  await sim(5); await snap('s4-combo-swing2', 'S4');
  await sim(40);
  }

  /* ---- S5: the cold-stone question — same shot, two times of day ---------- */
  if (seq('s5')) {
  console.log('[S5] tod pair: golden hour vs midday, same pose');
  await snap('s5-tod-default', 'S5');
  await page.evaluate(() => window.__GAME.setTimeOfDay(0.50));
  await sim(4); await snap('s5-tod-noon', 'S5');
  await page.evaluate(() => window.__GAME.setTimeOfDay(0.78));
  await sim(4);
  }

  /* ---- S6: what the clamp HOLDS — the same sim frame, both regimes -------- */
  /* §581. The containment ruling is a look judgement and every regime comparison this rig has
     ever had was a node measurement, so this pair is the first time the two have been seen.
     `clampSubject` is poked through `camera.tune` (the harness seam the rig grew for this), and
     both frames are taken at the SAME sim state: `capture()` runs `renderFrame(0)`, which re-runs
     `_write` with dt 0, and the clamp is stateless — so the only difference between the two PNGs
     is what the clamp aimed at. Two poses, per §466.5: a real pole climb at the crushed boom, and
     a ledge hang, whose camera position could show the whole body and, under the centre regime,
     does not. */
  if (seq('s6')) {
  console.log('[S6] clampSubject A/B — same sim frame, centre vs extent');
  const pair = async (name) => {
    for (const mode of ['centre', 'extent']) {
      await page.evaluate((m) => { window.__ENGINE.get('camera').tune.clampSubject = m; }, mode);
      /* CAPTURE FIRST, THEN MEASURE. `capture()` is what runs `renderFrame(0)` and therefore what
         re-runs `_write` with the new constant, so probing before it reads the PREVIOUS mode's
         pose and staples it to this mode's picture. The first run of this pair did exactly that
         and the numbers came out inverted against the images — caught only because the pictures
         disagreed with every node measurement. A number and a frame under one label have to come
         from the same render (§442). */
      const uri = await page.evaluate(() => window.__GAME.capture('image/png'));
      const s = await probe();
      const bf = await page.evaluate(() => {
        /* Body fraction, measured in the page off the real capsule and the real camera, so the
           number under the picture is the picture's own (§442: not a node number pasted beside a
           browser frame). Samples the capsule axis and counts what projects inside the frame. */
        const e = window.__ENGINE, m = e.get('movement'), cam = e.camera;
        const H = (typeof m.height === 'number' && m.height > 0.2) ? m.height : 1.8;
        let inside = 0; const N = 41;
        for (let k = 0; k < N; k++) {
          const p = m.position.clone(); p.y += (H * k) / (N - 1);
          const f = new p.constructor(); cam.getWorldDirection(f);
          const front = p.clone().sub(cam.position).dot(f) > cam.near;
          const v = p.project(cam);
          if (front && Math.abs(v.x) <= 1 && Math.abs(v.y) <= 1) inside++;
        }
        return { body: +(inside / N).toFixed(3), H: +H.toFixed(2) };
      });
      log.push({ tag: 'S6', frame: `${name}-${mode}`, mode, ...bf, ...s });
      await writeFile(`${OUT}/${name}-${mode}.png`, Buffer.from(uri.split(',')[1], 'base64'));
      console.log(`      -> ${name}-${mode}.png  body ${bf.body} · ${JSON.stringify(s)}`);
    }
    await page.evaluate(() => { window.__ENGINE.get('camera').tune.clampSubject = 'extent'; });
  };

  // A — the T3 drainpipe climb, the crushed-boom pose the ruling's own arms photograph.
  await tp(19.8, 0.02, -2.0, Math.PI);
  await sim(10);
  await page.keyboard.down('KeyW');
  for (let i = 0; i < 240; i++) {
    await sim(1);
    if (i % 8 === 0) { await page.keyboard.down('KeyE'); await sim(1); await page.keyboard.up('KeyE'); }
    const s = await probe();
    if (s.st === 'poleClimb' && s.p[1] > 5.5) break;
  }
  await page.keyboard.up('KeyE');
  await pair('s6-poleclimb');
  await page.keyboard.up('KeyW');

  /* B — the dune ascent (§475.5): ordinary play, W held, the boom occlusion-crushes into the
     sand behind the runner and the subject walks off the top of frame. DRIVEN, not placed.
     The first draft of this pose was a ledge hang set up in-page with `probeLedge` +
     `sm.set('ledgeHang')`, and the frame it produced had Sly buried in the courtyard paving with
     his hat poking through — the state name read `ledgeHang` and the pose was nothing a player
     can reach. A placed pose is a picture of my model of the world (§435.4); this one is driven. */
  /* B — the Cane Slam impact from height, one of the three failure classes the ruling was
     written for (§467) and the pose camclamp measures at −0.86 vs −0.65 ndcY between the two
     regimes. Staged with S2's recipe verbatim, press-check included: an instrument that stages a
     move must verify the move began (runs 2 and 3 of this harness photographed plain falls).
     A dune run was tried first and this harness could not reach the crush from the keyboard in
     420 frames; it printed that and shot nothing rather than photograph the wrong pose. */
  /* TELEPORT, not `position.set`. Pose A leaves Sly attached to the drainpipe, and assigning a
     position under an `attach` state re-snaps him to the pole on the next update — the first run
     of this pair staged a 16 m slam and photographed a `poleSwing` at the same spot as pose A,
     which the press-check caught and which would have been two pictures of one pose under two
     labels. `teleport` clears the attachment (it ends in `sm.set('fall'); sm.set('idle')`). */
  await page.evaluate(() => {
    const m = window.__ENGINE.get('movement');
    /* LEAVE THE STATE FIRST. `teleport()` and a bare `position.set` both failed here: an `attach`
       state re-snaps the position it owns on the very next update, so Sly stayed welded to the
       drainpipe at y 9.34 while the harness believed it had moved him to y 16. `sm.set('fall')`
       runs `PoleClimb.exit`, which is what actually releases him. */
    m.sm.set('fall');
    m.attached = null;
    m.position.set(0, 16, 40); m.velocity.set(0, 0, 0);
    m.grounded = false; m._needSpawnSnap = false;
  });
  await sim(14);
  {
    const s = await probe();
    if (s.gr || s.p[1] < 8) console.log(`      staging failed: st ${s.st} y ${s.p[1]} — not airborne`);
  }
  await page.mouse.down({ button: 'left' }); await sim(2); await page.mouse.up({ button: 'left' });
  {
    const s = await probe();
    if (s.st !== 'dive') console.log(`      ATTACK DID NOT REGISTER (st ${s.st}) — the slam pair is not a slam`);
  }
  let hit = -1;
  for (let i = 0; i < 90; i++) {
    await sim(1);
    const s = await probe();
    if (s.gr && s.st !== 'dive') { hit = i; break; }
  }
  if (hit >= 0) await pair('s6-slam');
  else console.log('      !! the slam never impacted — pair skipped rather than shot at the wrong pose');
  await page.keyboard.up('KeyW');
  }
} finally {
  await writeFile(`${OUT}/telemetry.json`, JSON.stringify({ sha, dirty, W, H, Q, errs, log }, null, 2));
  await browser.close();
  server.kill('SIGTERM');
  release();
  console.log('[look] released');
  if (errs.length) console.log(`[look] page errors:\n${errs.slice(0, 8).join('\n')}`);
}

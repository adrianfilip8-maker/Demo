#!/usr/bin/env node
/**
 * chaintrace — photograph the hook chain, the roll-cancel and the bounce on the SHIPPED model.
 *
 * WHY (§530). `tools/hookchain.mjs` says that on §575's five-ring nave chain a release and a catch
 * sit on the body together at summed weight 3.000 for 533 ms, and that 2 of the 4 hops never play
 * the grab at all because the re-fire inherits the previous catch's playhead. `tools/landseam.mjs`
 * says `roll` rides its own launch, fall AND landing at summed 3.000, and `double_jump` is averaged
 * 50/50 with the `jump_rise` a bounce rebounds out of. Every one of those is a statement about
 * COMPOSITION, not about a pose: two clips averaged 50/50 score 2.00 whether the mean looks
 * grotesque or nearly like both of them. Only frames settle whether it reads as a defect.
 *
 * THE THIRD ARM IS THE POINT, and it is landtrace's (§529.1) unchanged. before/after alone shows a
 * change; it does not show a CORRECTION. So every beat is also captured SOLO — the clip that is
 * supposed to be on the body played by itself, advanced to the same clip time, with nothing else
 * live. The claim the frames must support is not "after differs from before" but "after matches the
 * solo and before does not", and a reader can check that without trusting any number here.
 *
 * TAKES, and two samples per claim (§466.5):
 *   chain   the real nave chain, driven ring to ring with real keys from a hang under ring 0.
 *           Shot at the next TWO catches, each one checked to have been preceded by a release —
 *           that is the property the defect needs, and it is what the take asserts rather than a
 *           ring index. Two azimuths at the first. Which rings they land on is reported.
 *   roll    run, tap crouch to roll, tap jump to roll-cancel. Shot at the launch.
 *   bounce  jump, then `movement.bounce()` — the game's own public entry (`Controller.bounce`,
 *           what GUARDS calls on a head stomp and what the `enemyBounce` event routes to), so the
 *           request goes through `sm.request` and `Bounce.canEnter` exactly as it does in play.
 *           There is no key for it; this is the entry, not a poked state.
 *
 * BOTH ARMS COME FROM ONE PROCESS (§529.1, and now the house rule). The first landtrace pass shot
 * `before` and `after` as two runs of the dev server, and between them a sibling lane added 78
 * lines to `src/world/EgyptLevel.js` in this shared tree — so the two arms would have been
 * photographed against different geometry, with nothing in the images to reveal it. This tool
 * boots once, captures the shipped mixer, then reconstructs the PRE-§530 mixer in the same page by
 * clearing the rules' only inputs (`excl: 'hook_bite'` and `posture`) off the live clip table, and
 * captures again. One level, one build, one process; the mixer rules are the only variable. Both
 * strips are COUNTED and throw if they reach nothing — an inert control silently duplicates the
 * treatment arm and reads as "no difference found" (§525.7).
 *
 *   node tools/chaintrace.mjs                 # writes BOTH arms: hook1-after-* and hook1-before-*
 *   TAKE=chain node tools/chaintrace.mjs      # one take
 *
 * LIMITS. `Q=low` for SwiftShader's sake, so this is a POSE read, not a lighting or shading one
 * (accepted for this purpose by the coordinator, as in §525.1 and §529.1). One camera azimuth per
 * beat plus one opposite quarter at the first chain beat; a defect that hides at both is not
 * caught. It photographs the body — the cane rides a rigid socket on `handR`, so cane direction is
 * implied by the hand rather than independently measured. And it shoots the beats its own scripts
 * reach: silence about a beat is a statement about this file.
 */
import { chromium } from 'playwright';
import { acquire } from './lock.mjs';
import { spawn } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import net from 'node:net';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const OUT = process.env.OUT || `${ROOT}/shots`;
const RUN = process.env.RUN || 'hook1';
const W = Number(process.env.W || 1280), H = Number(process.env.H || 720);
const Q = process.env.Q || 'low';
const ONLY = process.env.TAKE || '';
let TAG = 'after';

/* §575's rings, kept here as the drive's TARGETS only — the page reads the real ones out of the
   level and this list is asserted against them, so a chain that moves fails loudly. */
const RINGS = [
  [0.0, 6.75, -21.0], [-3.4, 6.65, -27.0], [-4.0, 6.70, -33.7],
  [-2.0, 6.60, -40.8], [0.6, 6.70, -47.6],
];

async function freePort(start = 5830) {
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
  const bin = `${ROOT}/node_modules/.bin/vite`;
  if (!existsSync(bin)) throw new Error('vite not installed');
  const proc = spawn(bin, ['--port', String(port), '--strictPort', '--host', '127.0.0.1'],
    { cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, NO_COLOR: '1', SANDS_NO_HMR: '1' } });
  for (let i = 0; i < 240; i++) {
    const up = await new Promise((res) => {
      const s = net.connect(port, '127.0.0.1');
      s.once('connect', () => { res(true); s.destroy(); });
      s.once('error', () => res(false));
    });
    if (up) return proc;
    await new Promise((r) => setTimeout(r, 250));
  }
  proc.kill('SIGKILL');
  throw new Error('vite did not come up');
}

await mkdir(OUT, { recursive: true });
const release = await acquire('chaintrace');
const port = await freePort();
const server = await startServer(port);
const browser = await chromium.launch({
  executablePath: ['/opt/pw-browsers/chromium', '/usr/bin/chromium'].find((p) => existsSync(p)),
  args: ['--no-sandbox', '--disable-dev-shm-usage', '--use-gl=angle', '--use-angle=swiftshader',
    '--enable-unsafe-swiftshader', '--enable-webgl', '--ignore-gpu-blocklist',
    '--force-device-scale-factor=1', '--hide-scrollbars', '--mute-audio'],
});
const page = await browser.newPage({ viewport: { width: W, height: H } });
const errs = [];
page.on('pageerror', (e) => errs.push(`pageerror: ${e.message}`));

const telemetry = { q: Q, takes: {} };
const shotIndex = [];
try {
  await page.goto(`http://127.0.0.1:${port}/?shot=1&q=${Q}`, { waitUntil: 'domcontentloaded', timeout: 120000 });
  await page.waitForFunction('window.__GAME && window.__GAME.ready === true', null, { timeout: 600000, polling: 500 });
  console.log('[chaintrace] ready');

  await page.evaluate(() => {
    const e = window.__ENGINE;
    e.stopLoop();
    window.__GAME.hideHud(true);
    e.debug.freeCam = false;
    e.input.locked = true;
    window.__simStep = (n, dt) => {
      for (let i = 0; i < n; i++) {
        e.input?.beginFrame?.();
        e.dt = Math.min(dt, 1 / 20) * e.timeScale;
        if (e.debug.paused || e.paused) e.dt = 0;
        e.time += e.dt; e.frame++;
        for (const { key, mod } of e._ordered) {
          if (typeof mod.update === 'function') { try { mod.update(e.dt, e.time); } catch { /* keep stepping */ } }
        }
      }
    };
    /* Every transition the machine makes, intra-frame ones included. A chain catch is entered from
       `fall` and can be preempted inside one frame, so a per-frame sample of `stateName` is not a
       reliable record of what happened (landseam's header, §529 §3). */
    const m = e.get('movement');
    window.__steps = [];
    const prev = m.onStateChanged.bind(m);
    m.onStateChanged = (next, old) => { window.__steps.push(`${old?.name ?? '-'}->${next.name}`); return prev(next, old); };
  });

  /* The rings the LEVEL has, not the ones written above — asserted against each other so a chain
     that moved fails here rather than being photographed at the wrong place. */
  const liveRings = await page.evaluate(() => {
    const col = window.__ENGINE.get('collision');
    const out = [];
    for (let z = -18; z >= -52; z -= 0.5) {
      for (let x = -6; x <= 4; x += 0.5) {
        const a = col.nearest({ x, y: 6.7, z }, 'hook', 3.0);
        if (!a?.point) continue;
        if (!out.some((p) => Math.hypot(p[0] - a.point.x, p[1] - a.point.y, p[2] - a.point.z) < 1.0)) {
          out.push([+a.point.x.toFixed(2), +a.point.y.toFixed(2), +a.point.z.toFixed(2)]);
        }
      }
    }
    return out.sort((p, q) => q[2] - p[2]);
  });
  if (liveRings.length !== RINGS.length
      || liveRings.some((p, i) => Math.hypot(p[0] - RINGS[i][0], p[2] - RINGS[i][2]) > 0.2)) {
    throw new Error(`chaintrace: the level's nave rings are ${JSON.stringify(liveRings)}, not §575's `
      + `${JSON.stringify(RINGS.map((r) => [r[0], r[1], r[2]]))} — the chain moved, and every frame `
      + 'below would be of a different chain than the one this run names.');
  }
  console.log(`[chaintrace] ${liveRings.length} nave rings confirmed in the built level`);

  const sim = (n = 1) => page.evaluate((k) => window.__simStep(k, 1 / 60), n);

  /**
   * The game's OWN spawn, for the two ground takes. Not a written-down coordinate: `landtrace`'s
   * header records that `+10 z` — the offset the neighbouring capture tools reach for — is raised
   * ground here and `+20` is a pit, and this tool's first run found that the hall floor under ring
   * 0 actively damages him. The spawn is the one patch of floor the game itself guarantees is
   * standable, so `roll` and `bounce` are staged there rather than anywhere chosen by hand.
   */
  const HOME = await page.evaluate(() => {
    const m = window.__ENGINE.get('movement');
    return [m.position.x, m.position.y, m.position.z];
  });
  console.log(`[chaintrace] spawn ${HOME.map((v) => v.toFixed(2)).join(', ')}`);
  const probe = () => page.evaluate(() => {
    const e = window.__ENGINE, m = e.get('movement'), a = e.get('animation');
    const tracks = (a?.tracks || []).filter((t) => t.clip && t.w > 0.001).map((t) => ({
      n: t.clip.name, w: +t.w.toFixed(3), t: +t.time.toFixed(3), end: t.ending ? 1 : 0, lp: t.loop ? 1 : 0,
    }));
    return {
      st: m?.stateName, gr: !!m?.grounded, vy: +(m?.velocity?.y ?? 0).toFixed(2), aj: m?.airJumps,
      anchor: [+(m?.anchor?.x ?? 0).toFixed(2), +(m?.anchor?.y ?? 0).toFixed(2), +(m?.anchor?.z ?? 0).toFixed(2)],
      pos: [+(m?.position?.x ?? 0).toFixed(2), +(m?.position?.y ?? 0).toFixed(2), +(m?.position?.z ?? 0).toFixed(2)],
      yaw: +(m?.yaw ?? 0).toFixed(3),
      sum: +tracks.reduce((s, t) => s + t.w, 0).toFixed(3), tracks,
      steps: window.__steps.slice(),
    };
  });

  const snap = async (name, az = 90, dist = 3.4, h = 1.15) => {
    await page.evaluate(([azDeg, d, hh]) => {
      const e = window.__ENGINE, m = e.get('movement');
      const yaw = m.yaw ?? 0, a2 = yaw + (azDeg * Math.PI / 180);
      e.debug.freeCam = true;
      e.camera.position.set(m.position.x + Math.sin(a2) * d, m.position.y + hh, m.position.z + Math.cos(a2) * d);
      e.camera.lookAt(m.position.x, m.position.y + 0.95, m.position.z);
      e.camera.updateMatrixWorld(true);
    }, [az, dist, h]);
    const uri = await page.evaluate(() => window.__GAME.capture('image/png'));
    await page.evaluate(() => { window.__ENGINE.debug.freeCam = false; });
    await writeFile(`${OUT}/${RUN}-${TAG}-${name}.png`, Buffer.from(uri.split(',')[1], 'base64'));
    const p = await probe();
    shotIndex.push({ shot: `${RUN}-${TAG}-${name}`, az, pos: p.pos, yaw: p.yaw, st: p.st, sum: p.sum, tracks: p.tracks });
    console.log(`      -> ${RUN}-${TAG}-${name}.png  at [${p.pos}] ${p.st}  sum ${p.sum}  [${p.tracks.map((t) => `${t.n}:${t.w}@${t.t}`).join(' ')}]`);
    return p;
  };

  const key = async (code, down) => (down ? page.keyboard.down(code) : page.keyboard.up(code));
  const allUp = async () => { for (const k of ['KeyW', 'KeyS', 'KeyA', 'KeyD', 'Space', 'KeyE', 'ControlLeft']) await key(k, false); };

  /**
   * Put him somewhere, facing something, with every scrap of per-run state cleared — and REPORT
   * what the world did with him. The first run of this tool logged `idle->hurt` on the very first
   * take and carried on; a placement that damages the subject is a placement that may also be
   * standing him somewhere the drive cannot work from, and §562 is this repo's record of a
   * teleported probe producing a convincing result that was entirely the teleport's doing.
   */
  const place = async (x, z, yaw) => {
    await allUp();
    const st = await page.evaluate(([px, pz, py]) => {
      const e = window.__ENGINE, m = e.get('movement'), col = e.get('collision');
      const g = col.groundCheck({ x: px, y: 3, z: pz }, 0.34, 10);
      /* `teleport()`, not `position.set()`. Setting the position leaves the STATE MACHINE where
         it was, and `HookSwing.update` re-projects him onto the sphere around `c.anchor` every
         frame — so the roll take, staged straight after the chain take, was dragged back to ring
         3 and reported "placed on ground 0 — hookSwing". `teleport` is the game's own reset: it
         ends the episode with `sm.set('fall'); sm.set('idle')`, clears the wall/mark/buffer state
         and spends the spawn snap. Every reason this tool was reaching past it was a reason to
         use it. */
      const v = m.position.clone(); v.set(px, (g?.hit ? g.y : 0) + 0.35, pz);
      m.teleport(v, py);
      if (m.visualYaw !== undefined) m.visualYaw = py;
      m.landImpact = 0; m.hurtCooldown = 0;
      window.__steps.length = 0;
      const a = e.get('animation');
      for (const tr of a.tracks) if (tr.clip) { tr.clip = null; tr.w = 0; tr.ending = false; tr.lock = false; }
      return { ground: g?.hit ? +g.y.toFixed(2) : null };
    }, [x, z, yaw]);
    await sim(50);
    const p = await probe();
    const hurt = p.steps.some((s) => s.includes('hurt'));
    console.log(`      placed at [${p.pos}] on ground ${st.ground} — ${p.st}, grounded ${p.gr}`
      + (hurt ? '   !! the placement HURT him' : ''));
    /* A placement that damages the subject, or leaves him not standing, is not a stage — it is a
       hazard, and every frame shot from it would be of something other than the take. Driving on
       from one is how §562's teleported probe produced a convincing result that was entirely the
       teleport's doing. */
    if (hurt || !p.gr) {
      throw new Error(`chaintrace: the placement at (${x}, ${z}) left him ${p.st}, grounded ${p.gr}`
        + `${hurt ? ', and HURT him' : ''} — refusing to stage a take on it (§562).`);
    }
    await page.evaluate(() => { window.__steps.length = 0; });
    return p;
  };

  /** Put him in the AIR at an exact point — the rope staging, and the roll/bounce fallback. */
  const placeAir = async (x, y, z, yaw) => {
    await allUp();
    await page.evaluate(([px, py, pz, pyaw]) => {
      const e = window.__ENGINE, m = e.get('movement');
      const v = m.position.clone(); v.set(px, py, pz);
      m.teleport(v, pyaw);                 // see `place` — this also clears the state machine
      m.grounded = false; m.coyote = 99;
      if (m.visualYaw !== undefined) m.visualYaw = pyaw;
      m.landImpact = 0; m.hurtCooldown = 0;
      window.__steps.length = 0;
      const a = e.get('animation');
      for (const tr of a.tracks) if (tr.clip) { tr.clip = null; tr.w = 0; tr.ending = false; tr.lock = false; }
    }, [x, y, z, yaw]);
    const p = await probe();
    console.log(`      placed in air at [${p.pos}] — ${p.st}`);
    return p;
  };

  /**
   * Point the camera at a world point, from behind the player, and leave it there.
   *
   * THIS IS NOT A FRAMING CHOICE, it is what makes the drive work at all, and the first run of
   * this tool proved it by omission. `afford()` ranks candidates through `Collision.nearest`'s
   * facing weight, reading CAMERA forward (`_fwd`) — so with the camera left wherever the rig put
   * it, E picked a ring the drive was not heading for (it mounted ring 1 while standing under ring
   * 0), and `W` — which is camera-relative — pumped the swing in the wrong direction, so the chain
   * was lost after one hop. The node instrument (`tools/hookchain.mjs`) sets
   * `engine.camera.rotation` for exactly this reason; this is the same aim, in the browser.
   *
   * IT AIMS THROUGH THE RIG'S OWN YAW, and the obvious alternative is a trap this tool fell into.
   * Writing `engine.camera` directly needs `debug.freeCam` to stop the rig overwriting it — and
   * `Controller.update` RETURNS EARLY under `freeCam` ("Shot mode: Debug has posed Sly by hand"),
   * so the whole drive froze: 90 frames of key presses with the player parked at his placement and
   * an empty transition list. `freeCam` is for the still, not for the drive. Setting `rig.yaw`
   * leaves the rig running and it writes the camera itself, which is also what `camlook` does.
   */
  const aimAt = async (tx, tz) => {
    await page.evaluate(([ax, az]) => {
      const e = window.__ENGINE, m = e.get('movement'), cam = e.get('camera');
      const yaw = Math.atan2(ax - m.position.x, az - m.position.z);
      if (cam && typeof cam.yaw === 'number') cam.yaw = yaw;
      else { e.camera.rotation.set(0, yaw, 0, 'YXZ'); e.camera.updateMatrixWorld(true); }
    }, [tx, tz]);
  };

  /** Seat the rig behind him after a placement, so the first aimed frame is not a lerp from afar. */
  const seatCam = async () => {
    await page.evaluate(() => {
      const cam = window.__ENGINE.get('camera');
      try { cam?.snap?.(true); } catch { /* rig-less build */ }
    });
  };

  /** Advance until `pred` holds, at most `cap` frames. Null means it never did — callers THROW. */
  const until = async (pred, cap = 300, each = null) => {
    for (let i = 0; i < cap; i++) {
      if (each) await each(i);
      await sim(1);
      const p = await probe();
      if (pred(p, i)) return p;
    }
    return null;
  };

  /* ------------------------------------------------------- take 1: the chain ---- */
  /**
   * The chain, driven with keys only. He starts on the floor beneath ring 0 facing down the nave,
   * presses E to mount, then for each hop holds W (which pumps the swing), taps Space once the
   * wind-up has cleared `hookMinSwing`, and taps E through the flight — which is what a player
   * mashing through a chain does, and the cadence `hookchain --cadence mash` measured.
   *
   * The catch on ring 2 is the beat, and ring 3 is the second sample. Both are mid-chain and both
   * are preceded by a release, which is the case the defect needs; ring 0's mount is not, and
   * photographing it would show a clean catch and prove nothing.
   */
  const takeChain = async () => {
    console.log(`[${TAG}] take: the nave chain`);
    /**
     * He starts HANGING under ring 0, not standing on the floor beneath it, and that is a
     * correction the tool's own diagnostic forced. Placed on the hall floor at (0, −21) the
     * browser build put him at `grounded false` and in `hurt` within 50 frames — something at
     * that spot damages him, and a subject taking damage is not a subject this take can drive.
     * (The node instrument DOES mount from the floor and traverses all five rings; the floor
     * entry is proven there, so nothing is lost by not re-proving it here.)
     *
     * `navefork`'s own `hop()` uses exactly this placement — ring minus `hookL` — for the same
     * reason. The beat this take exists for is a catch that FOLLOWS a release; the mount is not
     * the beat, and staging it on the floor was buying risk for nothing.
     */
    await placeAir(RINGS[0][0], RINGS[0][1] - 2.2, RINGS[0][2], Math.PI);
    await seatCam();

    /* Which ring E takes is the game's business, not the script's — `afford` resolves by a
       distance/facing blend and is entitled to prefer the one down the nave. The drive below
       follows whichever it took, and every ring is reported. */
    let mounted = null;
    for (let i = 0; i < 90 && !mounted; i++) {
      await aimAt(RINGS[1][0], RINGS[1][2]);
      await key('KeyE', i % 3 === 0);
      await sim(1);
      const p = await probe();
      if (p.st === 'hookSwing') mounted = p;
    }
    await key('KeyE', false);
    if (!mounted) {
      const p = await probe();
      throw new Error(`chaintrace: never mounted the chain by E — ended ${p.st} at [${p.pos}], `
        + `steps ${p.steps.slice(-6).join(' ')}`);
    }
    const ringOf = (a) => RINGS.findIndex((r) => Math.hypot(a[0] - r[0], a[2] - r[2]) < 1.0);
    console.log(`      mounted ring ${ringOf(mounted.anchor)} at anchor [${mounted.anchor}]`);

    await key('KeyW', true);
    const rows = [];
    let ring = ringOf(mounted.anchor), onSince = 0, frame = 0, released = false;

    /**
     * Drive to the NEXT catch and hand it back with whether a release preceded it.
     *
     * The beat this take exists for is "a catch that follows a release", not "a catch on ring 3":
     * the inherited playhead needs a live grab from the previous catch, and it is the release in
     * between that the `hook_bite` slot acts on. Ring INDEX is over-specification — `hookchain`
     * already proves all five, on the machine, twice. So the shot beats are the next two catches
     * after the mount, each one checked to have had a release before it, and which rings they
     * landed on is REPORTED rather than demanded.
     */
    const nextCatch = async () => {
      released = false;
      for (let i = 0; i < 400; i++) {
        const p = await probe();
        const on = p.st === 'hookSwing';
        if (on) {
          const k = ringOf(p.anchor);
          if (k >= 0 && k !== ring) { ring = k; onSince = frame; return { p, ring: k, released }; }
        } else if (p.steps.some((s) => s === 'hookSwing->fall')) {
          released = true;
        }
        const target = RINGS[Math.min(ring + 1, RINGS.length - 1)];
        await aimAt(target[0], target[2]);
        await key('Space', on && frame - onSince === 14);
        await key('KeyE', !on && frame % 3 === 0);
        await sim(1);
        frame++;
        rows.push({ f: frame, st: p.st, ring, sum: p.sum, tracks: p.tracks });
        if (p.pos[1] < 1.2 && p.gr && frame > 60) break;
      }
      return null;
    };

    for (const nth of [1, 2]) {
      const hit = await nextCatch();
      if (!hit) {
        throw new Error(`chaintrace: the chain lost its ${nth === 1 ? 'first' : 'second'} hop after the mount `
          + `(reached ring ${ring}, steps ${(await probe()).steps.slice(-8).join(' ')}). `
          + 'Refusing to photograph whatever was on screen instead (§439).');
      }
      if (!hit.released) {
        throw new Error(`chaintrace: the catch on ring ${hit.ring} was NOT preceded by a release — `
          + 'that is a first catch, not a re-catch, and it cannot show the defect this take names.');
      }
      console.log(`      catch ${nth} on ring ${hit.ring} (after a release): sum ${hit.p.sum} `
        + `[${hit.p.tracks.map((t) => `${t.n}:${t.w}@${t.t}`).join(' ')}]`);
      await sim(2);
      await snap(`chain-c${nth}`);
      if (nth === 1) await snap('chain-c1-opp', 270);
    }
    await allUp();
    await page.evaluate(() => { window.__ENGINE.debug.freeCam = false; });
    telemetry.takes.chain = rows;
  };

  /* ------------------------------------------------------- take 2: roll-cancel ---- */
  const takeRoll = async () => {
    console.log(`[${TAG}] take: roll-cancel`);
    await place(HOME[0], HOME[2], Math.PI);
    await seatCam();
    await key('KeyW', true);
    await sim(50);                                      // up to roll speed (> 3.4 m/s)
    await key('ControlLeft', true); await sim(2); await key('ControlLeft', false);
    const rolling = await until((p) => p.st === 'roll', 40);
    if (!rolling) throw new Error('chaintrace: roll never entered — not at roll speed?');
    await sim(6);
    await key('Space', true);
    const hit = await until((p) => p.steps.some((s) => s === 'roll->jump'), 60);
    await key('Space', false);
    if (!hit) throw new Error(`chaintrace: roll->jump never driven (steps ${(await probe()).steps.join(' ')})`);
    console.log(`      roll->jump driven; sum ${hit.sum} [${hit.tracks.map((t) => `${t.n}:${t.w}@${t.t}`).join(' ')}]`);
    const rows = [];
    for (let f = 1; f <= 12; f++) {
      await sim(1);
      const p = await probe(); rows.push({ f, ...p, steps: undefined });
      if (f === 5) await snap('roll-f5');
      if (f === 9) await snap('roll-f9');
    }
    await allUp();
    telemetry.takes.roll = rows;
  };

  /* ------------------------------------------------------- take 3: the bounce ---- */
  const takeBounce = async () => {
    console.log(`[${TAG}] take: bounce`);
    await place(HOME[0], HOME[2], Math.PI);
    await seatCam();
    await key('KeyW', true);
    await key('Space', true); await sim(2); await key('Space', false);
    await sim(8);
    await page.evaluate(() => window.__ENGINE.get('movement').bounce());
    const hit = await until((p) => p.st === 'bounce', 20);
    if (!hit) throw new Error(`chaintrace: bounce never entered (steps ${(await probe()).steps.join(' ')})`);
    console.log(`      bounce entered; sum ${hit.sum} [${hit.tracks.map((t) => `${t.n}:${t.w}@${t.t}`).join(' ')}]`);
    const rows = [];
    for (let f = 1; f <= 12; f++) {
      await sim(1);
      const p = await probe(); rows.push({ f, ...p, steps: undefined });
      if (f === 4) await snap('bounce-f4');
      if (f === 8) await snap('bounce-f8');
    }
    await allUp();
    telemetry.takes.bounce = rows;
  };

  /* ------------------------------------------------------- the SOLO reference ---- */
  /**
   * What each beat is SUPPOSED to look like with nothing averaged into it. The state machine is
   * parked and the clip is played alone, then advanced to the clip time the take was shot at, so
   * the comparison is at matched clip PHASE rather than matched wall clock.
   */
  const takeSolo = async () => {
    console.log(`[${TAG}] take: SOLO references`);
    await place(HOME[0], HOME[2], Math.PI);
    await seatCam();
    await page.evaluate(() => {
      const e = window.__ENGINE;
      const step = window.__simStep;
      window.__REALSTEP = step;
      window.__simStep = (n, dt) => {
        for (let i = 0; i < n; i++) {
          e.input?.beginFrame?.();
          e.dt = Math.min(dt, 1 / 20) * e.timeScale;
          e.time += e.dt; e.frame++;
          for (const { key: k, mod } of e._ordered) {
            if (k === 'movement') continue;
            if (typeof mod.update === 'function') { try { mod.update(e.dt, e.time); } catch { /* keep stepping */ } }
          }
        }
      };
    });
    const rows = [];
    for (const [clip, name, frames] of [['hook_grab', 'solo-grab', 3], ['roll', 'solo-roll', 5], ['double_jump', 'solo-djump', 4]]) {
      await page.evaluate(([c, y]) => {
        const e = window.__ENGINE, m = e.get('movement'), a = e.get('animation');
        m.yaw = y; if (m.visualYaw !== undefined) m.visualYaw = y;
        for (const tr of a.tracks) if (tr.clip) { tr.clip = null; tr.w = 0; tr.ending = false; tr.lock = false; }
        a.play(c, { fade: 0.001, loop: false });
      }, [clip, Math.PI]);
      await sim(frames);
      const p = await probe(); rows.push({ clip, f: frames, ...p, steps: undefined });
      await snap(name);
    }
    await page.evaluate(() => { window.__simStep = window.__REALSTEP; });
    telemetry.takes.solo = rows;
  };

  const runArm = async (tag) => {
    TAG = tag;
    telemetry.takes = {};
    shotIndex.length = 0;
    if (!ONLY || ONLY === 'chain') await takeChain();
    if (!ONLY || ONLY === 'roll') await takeRoll();
    if (!ONLY || ONLY === 'bounce') await takeBounce();
    await takeSolo();
    telemetry.tag = tag;
    telemetry.rings = liveRings;
    telemetry.shots = shotIndex.slice();
    telemetry.errors = errs.slice();
    await writeFile(`${OUT}/${RUN}-${tag}-telemetry.json`, JSON.stringify(telemetry, null, 1));
    console.log(`[chaintrace:${tag}] arm done`);
  };

  await runArm('after');

  /**
   * The control. Both rules' inputs live on the module-level clip table, which the page does not
   * export — so reach the clip OBJECTS the way the mixer does (play each one, take `track.clip`),
   * clear the flags, then clear the tracks. That mutates the real table, so what follows is
   * genuinely the pre-§530 mixer rather than a parallel code path that could drift from it.
   */
  const cleared = await page.evaluate(() => {
    const a = window.__ENGINE.get('animation');
    const slot = ['hook_grab', 'hook_release'];
    const posture = ['land_soft', 'land_hard', 'land_roll', 'skid_stop', 'double_jump', 'roll'];
    let x = 0, p = 0;
    for (const nm of new Set([...slot, ...posture])) {
      const tr = a.play(nm, { fade: 0.001, loop: false });
      if (!tr?.clip) continue;
      if (tr.clip.excl === 'hook_bite') { tr.clip.excl = null; x++; }
      if (tr.clip.posture) { delete tr.clip.posture; p++; }
    }
    for (const tr of a.tracks) if (tr.clip) { tr.clip = null; tr.w = 0; tr.ending = false; tr.lock = false; }
    return { x, p, wantX: slot.length, wantP: posture.length };
  });
  if (cleared.x !== cleared.wantX || cleared.p !== cleared.wantP) {
    throw new Error(`chaintrace: the control cleared 'hook_bite' from ${cleared.x}/${cleared.wantX} clips and `
      + `\`posture\` from ${cleared.p}/${cleared.wantP} — an inert control arm silently duplicates the `
      + 'treatment arm and reads as "no difference found" (§525.7).');
  }
  console.log(`[chaintrace] control: 'hook_bite' cleared from ${cleared.x}, posture from ${cleared.p} — the PRE-§530 mixer`);
  await runArm('before');

  if (errs.length) console.log('  page errors:', errs.slice(0, 5));
} finally {
  await browser.close();
  server.kill('SIGKILL');
  release();
}

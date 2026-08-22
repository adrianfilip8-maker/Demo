#!/usr/bin/env node
/**
 * landtrace — photograph the landing/launch seam on the SHIPPED model, from real key input.
 *
 * WHY (§529). `tools/landseam.mjs` says a landing absorb and a launch sit on the body together
 * at summed weight 2.00 for 383 ms across all 31 bones. That is a statement about COMPOSITION,
 * not about a pose: two clips averaged 50/50 score 2.00 whether the mean looks grotesque or
 * nearly like both of them. Only frames settle whether it reads as a defect, and the coordinator's
 * standing rule is that a mild transient is exactly the case where a number will not decide it.
 *
 * THE THIRD ARM IS THE POINT. before/after alone shows a change; it does not show a CORRECTION.
 * So every beat is also captured SOLO — `jump_rise` played by itself, advanced to the same clip
 * time, with nothing else live. That is what the launch is supposed to look like at that instant.
 * The claim the frames have to support is not "after differs from before" but "after matches the
 * solo launch and before does not", and a reader can check that without trusting any number here.
 *
 * Two takes (`land`, `skid`), two captured beats each (§466.5 — two samples per claim), plus the
 * solo reference at both beats. Telemetry — live tracks, weights, summed weight, state — is
 * written beside the frames so each PNG can be read against what the mixer was actually doing.
 *
 * Real keys, real state machine, nothing poked: hold forward, jump, jump again in the air (which
 * spends the air jump), then tap jump once more just before touchdown — the buffer carries it
 * into the landing and `Jump` (64) preempts `Land` (50) inside the same frame. The skid take
 * runs, reverses the stick hard, and taps jump inside the skid.
 *
 *   node tools/landtrace.mjs                 # writes BOTH arms: after-*.png and before-*.png
 *
 * BOTH ARMS COME FROM ONE PROCESS, AND THAT IS NOT A CONVENIENCE. The first pass shot `before`
 * and `after` as two separate runs of the dev server. Between them another lane added 78 lines to
 * `src/world/EgyptLevel.js` in this shared working tree, so the two arms would have been
 * photographed against different geometry — a difference in the frames that had nothing to do
 * with the change under test, and nothing in the images to reveal it. So the tool boots once,
 * captures the shipped mixer, then reconstructs the PRE-fix mixer in the same page by stripping
 * `posture` off the live clip table (the rule's only input, exactly as `landseam --nofix` does)
 * and captures again. One level, one build, one process; the mixer rule is the only variable.
 * The strip is COUNTED and throws if it reaches nothing — an inert control arm that silently
 * duplicates the treatment arm is the §525.7 failure, and it reads as "no difference found".
 *
 * LIMITS. `Q=low` for SwiftShader's sake, so this is a POSE read, not a lighting or shading one
 * (accepted for this purpose by the coordinator, as in §525.1). One camera azimuth per beat plus
 * one opposite-quarter frame at the worst beat; a defect that hides at both azimuths is not
 * caught. It photographs the body — the cane rides a rigid socket on `handR`, so cane direction
 * is implied by the hand rather than independently measured here.
 */
import { chromium } from 'playwright';
import { acquire } from './lock.mjs';
import { spawn } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import net from 'node:net';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
/* Top-level `shots/`, with a run prefix. `shots/*/` is gitignored working output; the curated
   record is `shots/<run>-*.png` (the convention §525.1's `chain1-*` frames follow). The prefix is
   checked against the tracked set before a run commits — §525.2 lost a set to a `seam1-*` clash. */
const OUT = process.env.OUT || `${ROOT}/shots`;
const RUN = process.env.RUN || 'land1';
const W = Number(process.env.W || 1280), H = Number(process.env.H || 720);
let TAG = 'after';   // set per arm by runArm(); both arms come from ONE boot (see header)
const Q = process.env.Q || 'low';

async function freePort(start = 5810) {
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
const release = await acquire('landtrace');
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

const telemetry = { tag: TAG, q: Q, takes: {} };
const shotIndex = [];
try {
  await page.goto(`http://127.0.0.1:${port}/?shot=1&q=${Q}`, { waitUntil: 'domcontentloaded', timeout: 120000 });
  await page.waitForFunction('window.__GAME && window.__GAME.ready === true', null, { timeout: 600000, polling: 500 });
  console.log(`[landtrace:${TAG}] ready`);

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
    /* Record every transition the machine makes, intra-frame ones included — `land -> jump`
       happens entirely inside one frame (see landseam's header), so a per-frame sample of
       `stateName` cannot see it. */
    const m = e.get('movement');
    window.__steps = [];
    const prev = m.onStateChanged.bind(m);
    m.onStateChanged = (next, old) => { window.__steps.push(`${old?.name ?? '-'}->${next.name}`); return prev(next, old); };
  });

  const sim = (n = 1) => page.evaluate((k) => window.__simStep(k, 1 / 60), n);
  const probe = () => page.evaluate(() => {
    const e = window.__ENGINE, m = e.get('movement'), a = e.get('animation');
    const tracks = (a?.tracks || []).filter((t) => t.clip && t.w > 0.001).map((t) => ({
      n: t.clip.name, w: +t.w.toFixed(3), t: +t.time.toFixed(3), end: t.ending ? 1 : 0, lp: t.loop ? 1 : 0,
    }));
    return {
      st: m?.stateName, gr: !!m?.grounded, vy: +(m?.velocity?.y ?? 0).toFixed(2), aj: m?.airJumps,
      /* Where he is and which way he faces, recorded on every sample: `snap` places the camera
         at an azimuth RELATIVE to yaw, so two arms that disagree on either are not comparable
         frames however similar the poses are. The first pass of this tool shot its solo
         reference against a different backdrop and only a printed pose/yaw settled why. */
      pos: [+(m?.position?.x ?? 0).toFixed(2), +(m?.position?.y ?? 0).toFixed(2), +(m?.position?.z ?? 0).toFixed(2)],
      yaw: +(m?.yaw ?? 0).toFixed(3),
      sum: +tracks.reduce((s, t) => s + t.w, 0).toFixed(3), tracks,
      steps: window.__steps.slice(),
    };
  });

  const snap = async (name, az = 90, dist = 3.0, h = 1.15) => {
    const tel = await page.evaluate(([azDeg, d, hh]) => {
      const e = window.__ENGINE, m = e.get('movement');
      const yaw = m.yaw ?? 0, a2 = yaw + (azDeg * Math.PI / 180);
      e.debug.freeCam = true;
      e.camera.position.set(m.position.x + Math.sin(a2) * d, m.position.y + hh, m.position.z + Math.cos(a2) * d);
      e.camera.lookAt(m.position.x, m.position.y + 0.95, m.position.z);
      e.camera.updateMatrixWorld(true);
      return null;
    }, [az, dist, h]);
    void tel;
    const uri = await page.evaluate(() => window.__GAME.capture('image/png'));
    await page.evaluate(() => { window.__ENGINE.debug.freeCam = false; });
    await writeFile(`${OUT}/${RUN}-${TAG}-${name}.png`, Buffer.from(uri.split(',')[1], 'base64'));
    const p = await probe();
    shotIndex.push({ shot: `${RUN}-${TAG}-${name}`, az, pos: p.pos, yaw: p.yaw, st: p.st, sum: p.sum, tracks: p.tracks });
    console.log(`      -> ${RUN}-${TAG}-${name}.png  at [${p.pos}] yaw ${p.yaw}  sum ${p.sum}  [${p.tracks.map((t) => `${t.n}:${t.w}`).join(' ')}]`);
  };

  const key = async (code, down) => (down ? page.keyboard.down(code) : page.keyboard.up(code));
  /* Spawn itself. Probed rather than assumed: `+10 z` — the offset the neighbouring capture
     tools use — is raised ground here (y 0.68) and `+20` is a pit, and starting on either had
     the machine flapping `tiptoe->fall->idle` forever instead of standing still. */
  const home = await page.evaluate(() => {
    const m = window.__ENGINE.get('movement');
    m.velocity.set(0, 0, 0);
    return [m.position.x, m.position.y, m.position.z];
  });
  await sim(30);
  console.log(`[landtrace] home ${home.map((v) => v.toFixed(1)).join(', ')}`);
  /**
   * Position AND yaw are both restored. Yaw matters as much as position: `snap` places the
   * camera at an azimuth relative to `m.yaw`, so a take that turns him round (the skid take
   * turns him 180° by construction) frames the next take from the opposite side and the three
   * arms stop being comparable. The first pass of this tool shot the solo reference against a
   * completely different background for exactly that reason.
   */
  const reset = async () => {
    for (const k of ['KeyW', 'KeyS', 'Space']) await key(k, false);
    await page.evaluate(([x, y, z]) => {
      const m = window.__ENGINE.get('movement');
      m.position.set(x, y, z); m.velocity.set(0, 0, 0);
      m.yaw = Math.PI; if (m.visualYaw !== undefined) m.visualYaw = Math.PI;
      window.__steps.length = 0;
    }, home);
    await sim(40);
  };

  /**
   * Advance until `pred(probe)` is true, at most `cap` frames. Returns the probe at the frame it
   * stopped, or null — callers THROW on null rather than photographing whatever was on screen,
   * because a capture tool that silently shoots the wrong beat is worse than one that fails.
   */
  const until = async (pred, cap = 240) => {
    for (let i = 0; i < cap; i++) {
      await sim(1);
      const p = await probe();
      if (pred(p)) return p;
    }
    return null;
  };

  /* -------------------------------------------------- take 1: land -> jump ---- */
  const takeLand = async () => {
    console.log(`[${TAG}] take: land -> jump`);
    await reset();
    /* A STANDING jump reaches this seam, so the take does not travel and cannot wander off the
       flat ground the reset picked. Forward motion is irrelevant to the defect — `land_soft` and
       `jump_rise` share all 31 bones whether or not he is moving. */
    await key('Space', true); await sim(2); await key('Space', false);      // ground jump
    await sim(10);
    await key('Space', true); await sim(2); await key('Space', false);      // air jump: spends it
    const near = await until((p) => !p.gr && p.vy < 0 && p.aj === 0, 240);
    if (!near) throw new Error('landtrace: never reached the descent with the air jump spent');
    /**
     * Tap repeatedly on the way down rather than holding, which is what a player does when they
     * mean "jump the instant I land". A HELD key buffers once, on the press, so a single early
     * press expires before touchdown — the first draft did exactly that and the guard below
     * caught it as `fall->land land->move`.
     */
    let hit = null;
    for (let i = 0; i < 60 && !hit; i++) {
      await key('Space', true); await sim(1);
      await key('Space', false); await sim(1);
      const p = await probe();
      if (p.steps.some((s) => s === 'land->jump')) hit = p;
      else if (p.gr && p.st !== 'land') break;
    }
    if (!hit) throw new Error(`landtrace: land->jump never driven (steps: ${(await probe()).steps.join(' ')})`);
    console.log(`      land->jump driven; sum=${hit.sum} [${hit.tracks.map((t) => `${t.n}:${t.w}`).join(' ')}]`);
    const rows = [];
    for (let f = 1; f <= 12; f++) {
      await sim(1);
      const p = await probe(); rows.push({ f, ...p, steps: undefined });
      if (f === 4) { await snap('land-f4'); }
      if (f === 8) { await snap('land-f8'); await snap('land-f8-opp', 270); }
    }
    telemetry.takes.land = rows;
    await key('KeyW', false);
  };

  /* -------------------------------------------------- take 2: skid -> jump ---- */
  const takeSkid = async () => {
    console.log(`[${TAG}] take: skid -> jump`);
    await reset();
    await key('KeyW', true);
    await sim(45);
    await key('KeyW', false); await key('KeyS', true);                      // hard reversal
    const sk = await until((p) => p.st === 'skid', 60);
    if (!sk) throw new Error('landtrace: skid never entered');
    await sim(2);
    await key('Space', true);
    const hit = await until((p) => p.steps.some((s) => s === 'skid->jump'), 60);
    await key('Space', false);
    if (!hit) throw new Error(`landtrace: skid->jump never driven (steps: ${(await probe()).steps.join(' ')})`);
    console.log(`      skid->jump driven; sum=${hit.sum} [${hit.tracks.map((t) => `${t.n}:${t.w}`).join(' ')}]`);
    const rows = [];
    for (let f = 1; f <= 12; f++) {
      await sim(1);
      const p = await probe(); rows.push({ f, ...p, steps: undefined });
      if (f === 4) { await snap('skid-f4'); }
      if (f === 8) { await snap('skid-f8'); await snap('skid-f8-opp', 270); }
    }
    telemetry.takes.skid = rows;
    await key('KeyS', false);
  };

  /**
   * The reference arm: what the launch looks like with NOTHING averaged into it. The state
   * machine is parked and `jump_rise` is played alone, then advanced to the same clip times the
   * two takes were photographed at, so the comparison is at matched clip phase rather than at a
   * matched wall clock.
   */
  const takeSolo = async () => {
    console.log(`[${TAG}] take: jump_rise SOLO (reference)`);
    await reset();
    await page.evaluate(() => {
      const e = window.__ENGINE;
      window.__SKIPMOVE = true;
      const step = window.__simStep;
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
      window.__REALSTEP = step;                 // restored after this take — the next arm needs movement
      const m = e.get('movement');
      m.yaw = Math.PI;
      const a = e.get('animation');
      for (const tr of a.tracks) if (tr.clip) { tr.clip = null; tr.w = 0; tr.ending = false; tr.lock = false; }
      a.play('jump_rise', { fade: 0.001, loop: false });
    });
    const rows = [];
    for (let f = 1; f <= 12; f++) {
      await sim(1);
      const p = await probe(); rows.push({ f, ...p, steps: undefined });
      if (f === 4) await snap('solo-f4');
      if (f === 8) { await snap('solo-f8'); await snap('solo-f8-opp', 270); }
    }
    telemetry.takes.solo = rows;
    /* Put the real stepper back. The solo take parks the state machine, and leaving it parked
       would have silently turned the SECOND arm's driven takes into a still life. */
    await page.evaluate(() => { window.__SKIPMOVE = false; window.__simStep = window.__REALSTEP; });
  };

  const runArm = async (tag) => {
    TAG = tag;
    telemetry.takes = {};
    shotIndex.length = 0;
    await takeLand();
    await takeSkid();
    await takeSolo();
    telemetry.tag = tag;
    telemetry.shots = shotIndex.slice();
    telemetry.errors = errs.slice();
    await writeFile(`${OUT}/${RUN}-${tag}-telemetry.json`, JSON.stringify(telemetry, null, 1));
    console.log(`[landtrace:${tag}] arm done`);
  };

  /* The shipped mixer first, then the pre-fix mixer reconstructed in the same page. */
  await runArm('after');

  const stripped = await page.evaluate(() => {
    /* `posture` lives on the module-level clip table, which the page does not export. Reach the
       clip OBJECTS the way the mixer does — play each one and take `track.clip` — then delete the
       flag and clear the tracks. That mutates the real table, so what follows is genuinely the
       pre-§529 mixer rather than a parallel code path that could drift from it. */
    const a = window.__ENGINE.get('animation');
    const names = ['land_soft', 'land_hard', 'land_roll', 'skid_stop'];
    let n = 0;
    for (const nm of names) {
      const tr = a.play(nm, { fade: 0.001, loop: false });
      if (tr?.clip?.posture) { delete tr.clip.posture; n++; }
    }
    for (const tr of a.tracks) if (tr.clip) { tr.clip = null; tr.w = 0; tr.ending = false; tr.lock = false; }
    return n;
  });
  if (stripped !== 4) {
    throw new Error(`landtrace: the control stripped \`posture\` from ${stripped} clips, expected 4 — `
      + 'an inert control arm silently duplicates the treatment arm and reads as "no difference found" (§525.7).');
  }
  console.log(`[landtrace] control: posture stripped from ${stripped} clips — the PRE-§529 mixer`);
  await runArm('before');

  if (errs.length) console.log('  page errors:', errs.slice(0, 5));
} finally {
  await browser.close();
  server.kill('SIGKILL');
  release();
}

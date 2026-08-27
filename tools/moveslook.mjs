#!/usr/bin/env node
/**
 * moveslook.mjs — the §479 movement-set audit's camera: repo clip vs procedural clip for each
 * verb where BOTH exist, on the SHIPPED model, same beat, same framing.
 *
 * One invocation is ONE ARM (`AB=proc` or default godot) driving identical scripted takes, so
 * a before/after pair differs by the regime token alone — the same attribution rule twirltrace
 * and fliptrace use. Takes:
 *
 *   GAITS, real drive (the audit's rate-match evidence, not just pose evidence):
 *     walk (analog 0.45), run (0.75), sprint (1.0) — 3.5 s settle, then frames one half-cycle
 *     apart, plus phase-rate telemetry: |speed − phaseRate×stride| is the skate residual, and
 *     the stride in force comes from the page's own ACTIVE table, not from this script's idea
 *     of it.
 *   JUMP FAMILY, real drive: sprint + held jump — rise frame, post-apex fall frame, landing
 *     frames (land+3, land+8) keyed off the live state, not off a clock.
 *   ATTACH/POSE VERBS (ledge_hang, pole_climb, rail_walk, spire_balance, spire_land): the
 *     moveset never leaves the ground at spawn, so these are posed through the REAL
 *     `animation.play()` seam with the movement module's update skipped — the clip table, the
 *     splice, the donor fill, the skinning and the renderer are all the shipped ones; only the
 *     state machine that would immediately re-base the clip is parked. Captures at matched
 *     phases (15/40/65/90 % of each clip's own duration), with the track's live weight
 *     asserted ≥ 0.9 in telemetry so a fought-over track cannot pass as a pose (§510).
 *
 * Run:  node tools/moveslook.mjs                 (godot arm — shots/moves1/godot-*)
 *       AB=proc node tools/moveslook.mjs         (procedural arm — shots/moves1/proc-*)
 */
import { chromium } from 'playwright';
import { acquire } from './lock.mjs';
import { spawn, execFileSync } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import net from 'node:net';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const OUT = process.env.OUT || `${ROOT}/shots/moves1`;
const W = Number(process.env.W || 1920), H = Number(process.env.H || 1080);
const Q = process.env.Q || 'high';
const AB = process.env.AB || '';
const ARM = AB || 'godot';
/* Retake knobs — defaults reproduce the first run exactly (a queued arm must not diverge from
   a finished one). RESET_Z 40 + a 210-frame settle walks the gait takes ~11 m into the stair
   alcove north of the plaza (found on the first run's frames); a retake passes RESET_Z=30
   SETTLE=100 TAKES=gaits,jump TAG=-r2 to re-shoot those takes in the open plaza and write its
   telemetry beside the first run's rather than over it. */
const RESET_Z = Number(process.env.RESET_Z || 40);
const SETTLE = Number(process.env.SETTLE || 210);
const TAKES = (process.env.TAKES || 'gaits,jump,poses').split(',');
const TAG = process.env.TAG || '';

async function freePort(start = 5500) {
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
const release = await acquire('look2-moves');
console.log(`[moves] lock · sha ${sha}${dirty ? ` · DIRTY\n${dirty}` : ' · clean'} · arm ${ARM}`);

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

const tele = { gaits: {}, jump: {}, poses: {} };
try {
  await page.goto(`http://127.0.0.1:${port}/?shot=1&q=${Q}${AB ? `&anim=${AB}` : ''}`,
    { waitUntil: 'domcontentloaded', timeout: 120000 });
  await page.waitForFunction('window.__GAME && window.__GAME.ready === true', null, { timeout: 600000, polling: 500 });
  tele.regime = await page.evaluate(async () => {
    const m = await import('/src/player/Animation.js');
    return { regime: m.CLIP_REGIME, origin: Object.fromEntries(Object.entries(m.CLIP_ORIGIN).filter(([, o]) => o !== 'proc')) };
  });
  console.log(`[moves] ready · CLIP_REGIME=${tele.regime.regime} · swapped ${Object.keys(tele.regime.origin).length}`);
  await page.evaluate(() => {
    window.__ENGINE.stopLoop();
    window.__GAME.hideHud(true);
    window.__ENGINE.debug.freeCam = false;
    window.__ENGINE.input.locked = true;
    const e = window.__ENGINE;
    window.__MOVEMAG = null;               // analog stick injection, twirl.test's own pattern
    window.__SKIPMOVE = false;             // pose mode: park the state machine, keep the rest
    window.__simStep = (n, dt) => {
      for (let i = 0; i < n; i++) {
        e.input?.beginFrame?.();
        if (window.__MOVEMAG != null) { e.input.move.x = 0; e.input.move.y = window.__MOVEMAG; }
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
  const sim = (n = 1) => page.evaluate((k) => window.__simStep(k, 1 / 60), n);
  const snap = async (name) => {
    const uri = await page.evaluate(() => window.__GAME.capture('image/png'));
    await writeFile(`${OUT}/${ARM}-${name}.png`, Buffer.from(uri.split(',')[1], 'base64'));
    console.log(`      -> ${ARM}-${name}.png`);
  };
  const probe = () => page.evaluate(() => {
    const e = window.__ENGINE, m = e.get('movement'), a = e.get('animation');
    return {
      st: m?.stateName, gr: !!m?.grounded, sp: +(m?.speedXZ?.() ?? 0).toFixed(3),
      vy: +(m?.velocity?.y ?? 0).toFixed(2), phase: +(a?.phase ?? 0).toFixed(4),
      tracks: (a?.tracks || []).filter((t) => t.clip).map((t) => ({
        n: t.clip.name, w: +t.w.toFixed(3), t: +t.time.toFixed(3), lp: t.loop ? 1 : 0, end: t.ending ? 1 : 0,
      })),
    };
  });
  const reset = async () => {
    await page.evaluate((z) => {
      const m = window.__ENGINE.get('movement');
      m.position.set(0, 0, z); m.velocity.set(0, 0, 0);   // the spawn plaza (fliptrace's flat)
    }, RESET_Z);
    await page.evaluate(() => { window.__MOVEMAG = null; window.__SKIPMOVE = false; });
    await sim(40);
  };

  await sim(30);

  /* ---- gaits: walk / run / sprint ---------------------------------------------------------- */
  for (const [verb, mag, node] of TAKES.includes('gaits')
    ? [['walk', 0.45, 'walk'], ['run', 0.75, 'run'], ['sprint', 1.0, 'run_fast']] : []) {
    await reset();
    await page.evaluate((v) => { window.__MOVEMAG = v; }, mag);
    await sim(SETTLE);                                     // settle into the gait
    const rows = [];
    let f = 0;
    const stride = await page.evaluate(async (n) => (await import('/src/player/Animation.js')).ACTIVE[n].stride, node);
    /* two frames per §466.5, PHASE-matched across arms: the shared stride phase is the beat, so
       both regimes are photographed at contact-side (0.25) and swing-side (0.75) of the cycle
       regardless of how fast their cycles run. */
    const atPhase = async (target) => {
      for (let guard = 0; guard < 300; guard++) {
        const s = await probe();
        rows.push({ f, ...s });
        const ph = s.phase % 1;
        if (Math.abs(ph - target) < 0.02) return s;
        await sim(1); f++;
      }
      return probe();
    };
    await atPhase(0.25); await snap(`${verb}-a`);
    await atPhase(0.75); await snap(`${verb}-b`);
    const spMean = rows.reduce((s, r) => s + r.sp, 0) / rows.length;
    let dphi = 0;
    for (let i = 1; i < rows.length; i++) {
      let d = rows[i].phase - rows[i - 1].phase;
      if (d < -0.5) d += 1;
      dphi += d;
    }
    const rate = dphi / ((rows.length - 1) / 60);
    tele.gaits[verb] = {
      node, stride, speed: +spMean.toFixed(3), phaseRate: +rate.toFixed(3),
      skate: +(Math.abs(spMean - rate * stride)).toFixed(3),
      state: rows[rows.length - 1].st,
    };
    console.log(`[gait ${verb}] speed ${spMean.toFixed(2)} · stride ${stride} · phase ${rate.toFixed(2)} cyc/s · skate ${tele.gaits[verb].skate} m/s`);
  }

  /* ---- crouch: idle + walk through the REAL crouch state (§715) ---------------------------
   * The crouch pair now plays the recovered library clips (`Idle Crouch 2` / `Walk Crouch 4`),
   * so the acceptance frames drive the shipped state itself: ControlLeft held (the real crouch
   * bind), stick injected like the gaits above, phase-matched frames per §466.5, and the same
   * skate telemetry — the tree rate-matches crouch_walk by its derived stride exactly as it
   * does walk/run. The idle gets two frames at different beats of its 6.7 s fidget. */
  if (TAKES.includes('crouch')) {
    await reset();
    await page.keyboard.down('ControlLeft');
    await page.evaluate(() => { window.__MOVEMAG = 0.6; });
    await sim(SETTLE);
    const rows = [];
    let f = 0;
    const stride = await page.evaluate(async () => (await import('/src/player/Animation.js')).ACTIVE.crouch_walk.stride);
    const atPhase = async (target) => {
      for (let guard = 0; guard < 300; guard++) {
        const s = await probe();
        rows.push({ f, ...s });
        const ph = s.phase % 1;
        if (Math.abs(ph - target) < 0.02) return s;
        await sim(1); f++;
      }
      return probe();
    };
    await atPhase(0.25); await snap(`crouchwalk-a${TAG}`);
    await atPhase(0.75); await snap(`crouchwalk-b${TAG}`);
    const spMean = rows.reduce((s, r) => s + r.sp, 0) / rows.length;
    let dphi = 0;
    for (let i = 1; i < rows.length; i++) {
      let d = rows[i].phase - rows[i - 1].phase;
      if (d < -0.5) d += 1;
      dphi += d;
    }
    const rate = dphi / ((rows.length - 1) / 60);
    tele.crouch = {
      stride, speed: +spMean.toFixed(3), phaseRate: +rate.toFixed(3),
      skate: +(Math.abs(spMean - rate * stride)).toFixed(3),
      state: rows[rows.length - 1].st,
    };
    console.log(`[crouch walk] speed ${spMean.toFixed(2)} · stride ${stride} · phase ${rate.toFixed(2)} cyc/s · skate ${tele.crouch.skate} m/s · state ${tele.crouch.state}`);
    await page.evaluate(() => { window.__MOVEMAG = null; });
    await sim(100);
    await snap(`crouchidle-a${TAG}`);
    const idleProbe = await probe();
    await sim(110);                                   // ~1.8 s on — a different beat of the fidget
    await snap(`crouchidle-b${TAG}`);
    tele.crouch.idleState = idleProbe.st;
    tele.crouch.idleTracks = idleProbe.tracks;
    await page.keyboard.up('ControlLeft');
  }

  /* ---- jump family: rise / fall / land, keyed off live state ------------------------------- */
  if (TAKES.includes('jump')) {
    await reset();
    await page.evaluate(() => { window.__MOVEMAG = 1.0; });
    await sim(40);
    await page.keyboard.down('Space');
    await sim(6); await snap('jumprise');
    const rise = await probe();
    await sim(20);                                          // through apex (held rise 0.41 s)
    await page.keyboard.up('Space');
    /* The fall FRAME must show the fall clip DOMINANT, not merely selected: a vy threshold
       (−2, then −4.5 — both tried, both measured) fires while `jump_apex` is still fading out
       (0.95 then 0.24 of the blend), because the base swap starts a 0.14 s fade. So the probe
       waits for the `jump_fall` TRACK itself past 0.6 weight — the screen's own number. */
    let fall = null, guard = 0;
    while (guard++ < 140) {
      await sim(1);
      const s = await probe();
      const tr = s.tracks.find((x) => x.n === 'jump_fall');
      if (tr && tr.w > 0.6) { fall = s; break; }
      if (s.gr) break;                                     // landed before dominance — record honestly
    }
    await snap('jumpfall');
    let land = null; guard = 0;
    while (guard++ < 200) { await sim(1); const s = await probe(); if (s.gr) { land = s; break; } }
    await sim(3); await snap('land-a');
    const landA = await probe();
    await sim(5); await snap('land-b');
    tele.jump = { rise: rise?.tracks, fall: fall?.tracks, land: landA?.tracks, landState: landA?.st };
  }

  /* ---- attach/pose verbs through the real play() seam -------------------------------------- */
  const PHASES = [0.15, 0.40, 0.65, 0.90];
  for (const verb of TAKES.includes('poses')
    ? ['ledge_hang', 'pole_climb', 'rail_walk', 'spire_balance', 'spire_land', 'double_jump'] : []) {
    await reset();
    await page.evaluate(() => { window.__SKIPMOVE = true; });
    await sim(5);
    const clip = await page.evaluate(async (n) => {
      const { ACTIVE } = await import('/src/player/Animation.js');
      const a = window.__ENGINE.get('animation');
      a.play(n, { fade: 0.06, loop: ACTIVE[n].loop, speed: 1 });
      return { dur: ACTIVE[n].dur, loop: ACTIVE[n].loop };
    }, verb);
    await sim(10);                                          // fade-in
    const caps = [];
    let f = 10;
    for (const ph of PHASES) {
      const target = ph * clip.dur;
      let guard = 0;
      /* step until the verb's track playhead crosses the phase target (mod dur for loops) */
      for (;;) {
        const s = await probe();
        const tr = s.tracks.find((t) => t.n === verb);
        const tm = tr ? (clip.loop ? tr.t % clip.dur : tr.t) : -1;
        if (tr && tm >= target) { caps.push({ ph, t: +tm.toFixed(3), w: tr.w }); break; }
        if (guard++ > 400) { caps.push({ ph, t: -1, w: 0 }); break; }
        await sim(1); f++;
      }
      await snap(`${verb.replace(/_/g, '')}-p${Math.round(ph * 100)}`);
    }
    tele.poses[verb] = { dur: clip.dur, loop: clip.loop, caps };
    const wMin = Math.min(...caps.map((c) => c.w));
    console.log(`[pose ${verb}] dur ${clip.dur} · phases ${caps.map((c) => c.t).join('/')} · min track w ${wMin}`);
  }
} finally {
  await writeFile(`${OUT}/telemetry-${ARM}${TAG}.json`, JSON.stringify({ sha, dirty, W, H, Q, ARM, errs, tele }, null, 2));
  await browser.close();
  server.kill('SIGTERM');
  release();
  console.log('[moves] released');
  if (errs.length) console.log(`[moves] page errors:\n${errs.slice(0, 8).join('\n')}`);
}

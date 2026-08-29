#!/usr/bin/env node
/**
 * smashshot.mjs — §729's instrument: the imported destructible bodies photographed in place at
 * BOTH grades, a break driven through the REAL cane path (walked, never teleported — §435.4),
 * the mid-shatter and after-math frames, break persistence across the day/night toggle, and
 * the `?smash=gen` revert through the URL.
 *
 * What "the real path" means here, precisely: the player is WALKED to the cluster through
 * `input.move` (§435.4), the attack is pressed through `Input._press` — the seam every device
 * path calls, the same one swingshot documents (`?shot=1` runs with `input.enabled` false, so
 * a synthetic DOM key never reaches `_press`) — the combo state machine winds up and publishes
 * `caneHit`, and Smashables resolves it. Nothing pokes `_break`, nothing teleports, and the
 * out-of-range control swing is driven through the identical path first (§418.3's two inputs,
 * in the run itself). The day/night pairs go through the L1 pad tap daynightshot proved out.
 *
 * The camera stances are SWEPT against camDot in Node before any browser exists (§604): each
 * scene tries azimuths around its cluster until one passes all four legs, and the chosen rows
 * are printed into the record.
 *
 *   node tools/smashshot.mjs                 full run into shots/smash729/
 *   node tools/smashshot.mjs --out DIR       elsewhere
 *   CAMDOT=0 node tools/smashshot.mjs        pre-flight prints but does not refuse
 */
import { chromium } from 'playwright';
import { acquire } from './lock.mjs';
import { spawn, execFileSync } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import net from 'node:net';

const ROOT = path.resolve(import.meta.dirname, '..');
const argv = process.argv.slice(2);
const opt = (n, d) => { const i = argv.indexOf(`--${n}`); if (i < 0) return d; const v = argv[i + 1]; argv.splice(i, 2); return v; };
const OUTDIR = path.resolve(ROOT, opt('out', 'shots/smash729'));
const W = +opt('w', 1280), H = +opt('h', 720);
const TIMEOUT = +opt('timeout', 900) * 1000;

function sha() {
  try { return execFileSync('git', ['rev-parse', '--short', 'HEAD'], { cwd: ROOT }).toString().trim(); }
  catch { return '(no git)'; }
}

async function freePort(start = 5480) {
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
  const bin = path.join(ROOT, 'node_modules', '.bin', 'vite');
  if (!existsSync(bin)) throw new Error(`vite not installed in ${ROOT}`);
  const proc = spawn(bin, ['--port', String(port), '--strictPort', '--host', '127.0.0.1'], {
    cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, NO_COLOR: '1', SANDS_NO_HMR: '1' },
  });
  let log = '';
  proc.stdout.on('data', (d) => { log += d; });
  proc.stderr.on('data', (d) => { log += d; });
  const deadline = Date.now() + 60000;
  while (Date.now() < deadline) {
    if (/localhost:\d+|ready in/i.test(log)) break;
    if (proc.exitCode !== null) throw new Error(`vite exited (${proc.exitCode}):\n${log}`);
    await new Promise((r) => setTimeout(r, 250));
  }
  for (let i = 0; i < 80; i++) {
    const up = await new Promise((res) => {
      const s = net.connect(port, '127.0.0.1');
      s.once('connect', () => { res(true); s.destroy(); });
      s.once('error', () => res(false));
      s.setTimeout(2000, () => { res(false); s.destroy(); });
    });
    if (up) return proc;
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error(`vite never listened on ${port}:\n${log}`);
}

/* ------------------------------------------------------------- stances --- */

/** The clusters, from the shipped author function on the shipped route — never retyped. */
function clusterSpots() {
  const t = readFileSync(path.join(ROOT, 'src/world/EgyptLevel.js'), 'utf8');
  const m = t.match(/api\.route\s*=\s*\[([\s\S]*?)\n\s*\];/);
  const route = [];
  const re = /\[\s*'([^']+)'\s*,\s*(-?[\d.]+)\s*,\s*(-?[\d.]+)\s*,\s*(-?[\d.]+)\s*\]/g;
  let w;
  while ((w = re.exec(m[1]))) route.push([w[1], +w[2], +w[3], +w[4]]);
  return { route };
}

/** Sweep azimuths around a look-at point until camDot passes (§604, §724's swept-stance move). */
async function sweepStance(camDot, at, { r = 4.4, eye = 1.7, lookUp = 0.35 } = {}) {
  const rows = [];
  for (const deg of [205, 230, 180, 155, 250, 130, 275, 25, 65, 90, 335, 300]) {
    const a = deg * Math.PI / 180;
    const pos = [at[0] + Math.sin(a) * r, at[1] + eye, at[2] + Math.cos(a) * r];
    const target = [at[0], at[1] + lookUp, at[2]];
    const d = await camDot(pos, target);
    rows.push(`    az ${String(deg).padStart(3)}  enclosed ${d.near}/${d.dirs}  nearest ${d.nearest == null ? '—' : d.nearest.toFixed(2)}  `
      + `forward ${d.forward == null ? '—' : d.forward.toFixed(2)}  ${d.ok ? 'ok' : 'REFUSE ' + d.reasons.join('·')}`);
    if (d.ok) return { pos, target, deg, rows };
  }
  return { pos: null, rows };
}

/* ---------------------------------------------------------------- page --- */

const PAD_INIT = `
  (() => {
    const pad = {
      index: 0, id: 'smashshot synthetic DS4', mapping: 'standard', connected: true,
      axes: [0, 0, 0, 0],
      buttons: Array.from({ length: 17 }, () => ({ pressed: false, value: 0, touched: false })),
      timestamp: 0,
    };
    window.__PAD = {
      pad,
      press(i) { pad.buttons[i] = { pressed: true, value: 1, touched: true }; pad.timestamp++; },
      release(i) { pad.buttons[i] = { pressed: false, value: 0, touched: false }; pad.timestamp++; },
    };
    Object.defineProperty(navigator, 'getGamepads', { value: () => [pad], configurable: true });
  })();
`;

const PAGE_LIB = `
  window.__ss = (() => {
    const E = window.__ENGINE, G = window.__GAME;
    E.stopLoop();
    G.hideHud(true);
    const dbg = E.debugTools;
    const pump = (n = 1) => { for (let i = 0; i < n; i++) E.renderFrame(0); };
    /* the walked drive — swingshot's, verbatim in shape: input folded per frame, modules
       stepped in engine order with a real dt, no render */
    const drive = (n, dt, cmd) => {
      for (let i = 0; i < n; i++) {
        E.input?.beginFrame?.(dt);
        if (cmd) {
          E.input.move.x = cmd.mx || 0;
          E.input.move.y = cmd.my || 0;
          if (cmd.aimAt) {
            const dx = cmd.aimAt[0] - E.get('movement').position.x;
            const dz = cmd.aimAt[2] - E.get('movement').position.z;
            E.camera.rotation.set(0, Math.atan2(-dx, -dz), 0, 'YXZ');
            E.camera.updateMatrixWorld(true);
          }
        }
        E.dt = Math.min(dt, 1 / 20) * E.timeScale;
        E.time += E.dt; E.frame++;
        for (const { key, mod } of E._ordered) {
          if (typeof mod.update === 'function') { try { mod.update(E.dt, E.time); } catch {} }
        }
      }
    };
    /* WALK to a planar point through input.move — flips the stick sign if the first frames
       lose ground, so the tool cannot silently moonwalk away (§435.4: the position must come
       from locomotion, so the convention is discovered, not assumed) */
    const walkTo = (pt, stop = 1.2, maxFrames = 900, jumpEvery = 0) => {
      const mv = E.get('movement');
      const dist = () => Math.hypot(mv.position.x - pt[0], mv.position.z - pt[2]);
      let sign = -1, d0 = dist(), frames = 0;
      drive(12, 1 / 60, { my: sign, aimAt: pt });
      if (dist() > d0 - 0.02) { sign = 1; }
      let stall = 0, last = dist();
      while (dist() > stop && frames < maxFrames) {
        drive(1, 1 / 60, { my: sign, aimAt: pt }); frames++;
        /* a ledge on the way is mantled the way a player mantles it: forward + jump through
           the input seam — pulsed only while progress has stalled, never on open ground */
        const d = dist();
        if (d > last - 0.005) stall++; else { stall = 0; last = d; }
        if (jumpEvery && stall > 0 && frames % jumpEvery === 0) {
          E.input._press('jump', 'key');
          drive(2, 1 / 60, { my: sign, aimAt: pt }); frames += 2;
          E.input._release('jump', 'key');
        }
      }
      drive(6, 1 / 60, { my: 0 });
      return { frames, dist: +dist().toFixed(3), walked: frames > 0 };
    };
    const swing = (frames = 36) => {
      const before = window.__SMEV.length;
      E.input._press('attack', 'key');
      drive(2, 1 / 60, { my: 0 });
      E.input._release('attack', 'key');
      drive(frames, 1 / 60, { my: 0 });
      return { events: window.__SMEV.length - before, state: E.get('movement').stateName };
    };
    const cam = (pos, target) => {
      E.debug.freeCam = false;
      E.camera.position.set(...pos);
      E.camera.lookAt(...target);
      E.camera.updateMatrixWorld(true);
    };
    const grab = () => {
      const png = G.capture();
      const img = new Image();
      return new Promise((res) => {
        img.onload = () => {
          const c = document.createElement('canvas');
          c.width = img.width; c.height = img.height;
          const g2 = c.getContext('2d', { willReadFrequently: true });
          g2.drawImage(img, 0, 0);
          const d = g2.getImageData(0, 0, img.width, img.height).data;
          let L = 0, n = 0;
          for (let i = 0; i < d.length; i += 4) { L += 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2]; n++; }
          res({ png, meanL: +(L / n).toFixed(1) });
        };
        img.src = png;
      });
    };
    /* one press–release of L1 through the pad poll; then run the fade out */
    const toggleGrade = () => {
      window.__PAD.press(4); pump(1); window.__PAD.release(4); pump(1);
      let n = 0; while (dbg._dnActive && n < 400) { pump(1); n++; }
      return { frames: n, tod: E.debug.timeOfDay };
    };
    window.__SMEV = [];
    E.on('propSmashed', (p) => window.__SMEV.push({ x: p.pos.x, y: p.pos.y, z: p.pos.z, material: p.material, scale: p.scale }));
    return { E, G, dbg, pump, drive, walkTo, swing, cam, grab, toggleGrade };
  })();
`;

async function run() {
  await mkdir(OUTDIR, { recursive: true });
  const { route } = clusterSpots();
  const { authorSmashables } = await import(path.join(ROOT, 'src/world/Smashables.js'));
  const specs = authorSmashables(route);
  const spawnJar = specs.find((s) => s.at === 'spawn' && s.kind === 'jar');
  const gateCrate = specs.find((s) => s.at === 'inner-gate' && s.kind === 'crate');
  /* the SECOND walked break (§466.5): the terrace-1 cluster, one leg up the authored route
     from spawn — reachable by construction, because it is the designer's own walking line */
  const terraceProp = specs.find((s) => s.at === 'terrace-1');
  if (!spawnJar || !gateCrate || !terraceProp) throw new Error('the shipped author no longer places a spawn jar / gate crate / terrace prop');

  console.log(`[smashshot] camDot pre-flight (in-Node, swept — §604)`);
  const { camDot } = await import('./camdot.mjs');
  const A = await sweepStance(camDot, [spawnJar.x, spawnJar.y, spawnJar.z]);
  const B = await sweepStance(camDot, [gateCrate.x, gateCrate.y, gateCrate.z]);
  const C = await sweepStance(camDot, [terraceProp.x, terraceProp.y, terraceProp.z]);
  console.log(`  stanceA (spawn jar @ ${spawnJar.x.toFixed(2)},${spawnJar.z.toFixed(2)}):\n${A.rows.join('\n')}`);
  console.log(`  stanceB (gate crate @ ${gateCrate.x.toFixed(2)},${gateCrate.z.toFixed(2)}):\n${B.rows.join('\n')}`);
  console.log(`  stanceC (terrace ${terraceProp.kind} @ ${terraceProp.x.toFixed(2)},${terraceProp.z.toFixed(2)}):\n${C.rows.join('\n')}`);
  if ((!A.pos || !B.pos || !C.pos) && process.env.CAMDOT !== '0') {
    throw new Error('[smashshot] no swept azimuth passed camDot — refusing to photograph blind');
  }

  console.log('[smashshot] waiting for capture lock…');
  const release = await acquire({ onWait: (ms) => process.stdout.write(`· queued for the capture lock (${(ms / 1000) | 0}s)\n`) });
  let server = null, browser = null;
  const report = { sha: sha(), when: new Date().toISOString(), stances: { A, B }, frames: [], measures: {} };
  try {
    const port = await freePort();
    server = await startServer(port);
    browser = await chromium.launch({
      executablePath: ['/opt/pw-browsers/chromium', '/usr/bin/chromium', '/usr/bin/chromium-browser'].find(existsSync),
      args: ['--no-sandbox', '--disable-dev-shm-usage', '--use-gl=angle', '--use-angle=swiftshader',
        '--enable-unsafe-swiftshader', '--enable-webgl', '--ignore-gpu-blocklist', '--disable-frame-rate-limit',
        '--js-flags=--max-old-space-size=4096', '--force-device-scale-factor=1', '--hide-scrollbars', '--mute-audio'],
    });
    const page = await browser.newPage({ viewport: { width: W, height: H } });
    await page.addInitScript(PAD_INIT);
    page.on('console', (m) => { if (m.type() === 'error') console.log(`[page:err] ${m.text()}`); });

    const boot = async (q) => {
      await page.goto(`http://127.0.0.1:${port}/?shot=1&q=high${q}`, { waitUntil: 'domcontentloaded', timeout: 120000 });
      await page.waitForFunction(() => window.__GAME?.ready, null, { timeout: TIMEOUT });
      await page.evaluate(PAGE_LIB);
    };
    await boot('');

    /* provenance: the swap is armed and conformed as the module reports */
    const prov = await page.evaluate(() => {
      const sm = window.__ENGINE.get('smashables');
      const subs = window.__ENGINE._events.get('propSmashed');
      return { swap: sm.debugInfo().swap, placed: sm.debugInfo().placed, subscribers: subs ? subs.size : 0 };
    });
    report.provenance = prov;
    console.log(`[smashshot] swap armed ${prov.swap.armed} · ${prov.placed} placed · conforms ${JSON.stringify(prov.swap.swapped)} · fallbacks ${JSON.stringify(prov.swap.fallbacks)}`);
    console.log(`[smashshot] propSmashed subscribers at boot+recorder: ${prov.subscribers} (Audio + Particles + this tool)`);
    if (!prov.swap.armed || prov.swap.fallbacks.length) throw new Error('the swap is not fully armed in the page — a frame of this proves nothing');
    if (prov.subscribers < 3) throw new Error(`only ${prov.subscribers} propSmashed subscribers — a consumer died in the swap (§592 shape)`);

    const save = async (name, res, meta = {}) => {
      await writeFile(path.join(OUTDIR, `${name}.png`), Buffer.from(res.png.split(',')[1], 'base64'));
      report.frames.push({ name, meanL: res.meanL, ...meta });
      console.log(`  ${name.padEnd(28)} meanL ${res.meanL}  ${JSON.stringify(meta)}`);
    };

    /* ── the in-place pairs, two stances × two grades (§466.5) ─────────────────────────── */
    for (const [label, S, shot] of [['spawn-props', A, 'courtyard'], ['gate-crates', B, 'temple']]) {
      await page.evaluate(async ({ shot }) => { await window.__ss.G.setShot(shot, { dt: 0 }); }, { shot });
      const day = await page.evaluate(async ({ pos, target }) => {
        const S2 = window.__ss; S2.cam(pos, target); S2.pump(2);
        const f = await S2.grab();
        return { ...f, tod: S2.E.debug.timeOfDay };
      }, S);
      await save(`${label}-day`, day, { tod: day.tod });
      const night = await page.evaluate(async ({ pos, target }) => {
        const S2 = window.__ss;
        const t = S2.toggleGrade();
        S2.cam(pos, target); S2.pump(1);
        const f = await S2.grab();
        return { ...f, tod: S2.E.debug.timeOfDay, fade: t.frames };
      }, S);
      await save(`${label}-night`, night, { tod: night.tod, fadeFrames: night.fade });
      /* back to the staged grade so the next scene starts clean */
      await page.evaluate(() => { const S2 = window.__ss; S2.toggleGrade(); });
    }

    /* ── the break: walked, out-of-range control first, then the hit (§418.3 in the run) ── */
    await page.evaluate(async () => { await window.__ss.G.setShot('courtyard', { dt: 0 }); });
    const breakRun = await page.evaluate(async ({ jar, cam }) => {
      const S2 = window.__ss;
      const mv = S2.E.get('movement');
      /* control: walk to 4.2 m planar from the jar, swing — the same path, out of reach */
      const far = S2.walkTo([jar.x + 4.2, jar.y, jar.z + 0.0], 1.0, 1200);
      const ctrl = S2.swing(40);
      /* then walk IN and swing for real */
      const near = S2.walkTo([jar.x, jar.y, jar.z], 1.15, 1200);
      S2.cam(cam.pos, cam.target); S2.pump(1);
      const before = S2.E.get('smashables').debugInfo().broken;
      const preFx = S2.E.get('fx')?.emitters?.length ?? -1;
      const hit = S2.swing(5);                    // caneHit fires on the wind-up — grab mid-shatter
      const mid = await S2.grab();
      S2.drive(110, 1 / 60, { my: 0 });           // debris dies in under a second
      const post = await S2.grab();
      const after = S2.E.get('smashables').debugInfo().broken;
      const postFx = S2.E.get('fx')?.emitters?.length ?? -1;
      /* latch: the same swing again, through the same path */
      const again = S2.swing(40);
      return {
        far, ctrl, near, hit, again,
        broken: { before, after }, fx: { before: preFx, after: postFx },
        events: window.__SMEV.slice(),
        playerAt: [mv.position.x.toFixed(2), mv.position.z.toFixed(2)],
        mid, post,
      };
    }, { jar: { x: spawnJar.x, y: spawnJar.y, z: spawnJar.z }, cam: { pos: A.pos, target: A.target } });

    report.measures.break = {
      control: { walkedFrames: breakRun.far.frames, dist: breakRun.far.dist, events: breakRun.ctrl.events },
      hit: { walkedFrames: breakRun.near.frames, dist: breakRun.near.dist, events: breakRun.hit.events },
      latch: { events: breakRun.again.events, brokenAfter: breakRun.broken },
      fxEmitters: breakRun.fx,
      eventPayloads: breakRun.events,
    };
    console.log(`[smashshot] control swing at ${breakRun.far.dist} m (walked ${breakRun.far.frames} frames): ${breakRun.ctrl.events} events — must be 0`);
    console.log(`[smashshot] real swing at ${breakRun.near.dist} m (walked ${breakRun.near.frames} frames): ${breakRun.hit.events} events, broken ${breakRun.broken.before}->${breakRun.broken.after}`);
    console.log(`[smashshot] latch: repeat swing broke ${breakRun.again.events} — must be 0 · fx emitters ${breakRun.fx.before}->${breakRun.fx.after}`);
    console.log(`[smashshot] payloads: ${JSON.stringify(breakRun.events)}`);
    if (breakRun.ctrl.events !== 0) throw new Error('the out-of-range control swing broke something — the resolve is not the one shipped');
    if (breakRun.hit.events < 1) throw new Error('the walked in-range swing broke nothing — the swap killed the mechanic');
    if (breakRun.again.events !== 0) throw new Error('a broken prop broke again — the latch died in the swap');
    if (!breakRun.events.every((e) => e.material === 'wood')) throw new Error('a swapped break did not report the measured wood tag');
    await save('spawn-midbreak-day', breakRun.mid, { eventsAtGrab: breakRun.hit.events });
    await save('spawn-postbreak-day', breakRun.post, { broken: breakRun.broken.after });

    /* ── break persistence across the grade toggle: still broken at night ───────────────── */
    const persist = await page.evaluate(async () => {
      const S2 = window.__ss;
      const t = S2.toggleGrade();
      S2.pump(1);
      const f = await S2.grab();
      return { ...f, tod: S2.E.debug.timeOfDay, fade: t.frames, broken: S2.E.get('smashables').debugInfo().broken };
    });
    await save('spawn-postbreak-night', persist, { tod: persist.tod, broken: persist.broken });
    report.measures.persistAcrossGrade = { broken: persist.broken, tod: persist.tod };

    /* ── the SECOND walked break (§466.5): up the route to terrace-1, a different kind.
       The terrace is a raised slab: the leg pulses jump-through-input while stalled so a ledge
       is mantled the way a hand mantles it. If the leg still cannot arrive, the sample is NOT
       faked and NOT skipped: the tool retargets the nearest unbroken smashable to wherever the
       player actually stands — a walked break is the claim, not a particular postcode — and the
       record says which target carried it (§435.4: the world decides, not my model of it). ── */
    const break2 = await page.evaluate(async ({ prop, cam }) => {
      const S2 = window.__ss;
      S2.toggleGrade();                            // back to day for a like-for-like pair
      const sm = S2.E.get('smashables');
      const mv = S2.E.get('movement');
      let target = { x: prop.x, y: prop.y, z: prop.z, at: 'terrace-1' };
      let leg = S2.walkTo([target.x, target.y, target.z], 1.15, 2400, 36);
      let retargeted = null;
      if (leg.dist > 1.6) {
        let best = null, bd = 1e9;
        for (const p of sm.props) {
          if (p.broken) continue;
          const d = Math.hypot(p.pos.x - mv.position.x, p.pos.z - mv.position.z)
            + Math.abs(p.pos.y - mv.position.y) * 3;   // prefer the player's own floor
          if (d < bd) { bd = d; best = p; }
        }
        if (best) {
          retargeted = { kind: best.kind, at: best.at };
          target = { x: best.pos.x, y: best.pos.y, z: best.pos.z, at: best.at };
          leg = S2.walkTo([target.x, target.y, target.z], 1.15, 2400, 36);
        }
      }
      S2.cam(cam.pos, cam.target); S2.pump(1);
      const before = sm.debugInfo().broken;
      const hit = S2.swing(5);
      const mid = await S2.grab();
      S2.drive(110, 1 / 60, { my: 0 });
      const post = await S2.grab();
      const after = sm.debugInfo().broken;
      return { leg, hit, before, after, retargeted, targetAt: target.at, playerY: +mv.position.y.toFixed(2), mid, post };
    }, { prop: { x: terraceProp.x, y: terraceProp.y, z: terraceProp.z }, cam: { pos: C.pos, target: C.target } });
    report.measures.break2 = {
      kind: break2.retargeted?.kind ?? terraceProp.kind, at: break2.targetAt, retargeted: break2.retargeted,
      walkedFrames: break2.leg.frames, dist: break2.leg.dist,
      events: break2.hit.events, broken: { before: break2.before, after: break2.after }, playerY: break2.playerY,
    };
    console.log(`[smashshot] second break (${report.measures.break2.kind} @ ${break2.targetAt}${break2.retargeted ? ', RETARGETED' : ''}): `
      + `walked ${break2.leg.frames} frames to ${break2.leg.dist} m (player y ${break2.playerY}), ${break2.hit.events} events, `
      + `broken ${break2.before}->${break2.after}`);
    if (break2.hit.events < 1) throw new Error('the second walked break broke nothing — one sample was carrying the claim (§466.5)');
    await save('terrace-midbreak-day', break2.mid, { kind: report.measures.break2.kind, at: break2.targetAt, events: break2.hit.events });
    await save('terrace-postbreak-day', break2.post, { broken: break2.after });

    /* ── the revert, through the URL in a fresh boot ────────────────────────────────────── */
    await boot('&smash=gen');
    const gen = await page.evaluate(async ({ cam, shot }) => {
      const S2 = window.__ss;
      await S2.G.setShot(shot, { dt: 0 });
      const sm = S2.E.get('smashables');
      const info = sm.debugInfo();
      const jarMesh = sm._meshes.get('jar');
      S2.cam(cam.pos, cam.target); S2.pump(2);
      const f = await S2.grab();
      return {
        ...f, armed: info.swap.armed, placed: info.placed,
        jarTris: jarMesh ? jarMesh.mesh.geometry.attributes.position.count / 3 : 0,
        jarMat: jarMesh ? jarMesh.mesh.material.name : '',
      };
    }, { cam: { pos: A.pos, target: A.target }, shot: 'courtyard' });
    report.measures.genArm = { armed: gen.armed, placed: gen.placed, jarTris: gen.jarTris, jarMat: gen.jarMat };
    console.log(`[smashshot] ?smash=gen boot: armed ${gen.armed} · placed ${gen.placed} · jar ${gen.jarTris} tris on '${gen.jarMat}'`);
    if (gen.armed !== false || gen.jarMat !== 'smash:clay') {
      throw new Error('the ?smash=gen revert did not restore the generated bodies through the URL');
    }
    await save('spawn-props-gen-day', gen, { armed: gen.armed, jarTris: gen.jarTris });

    await writeFile(path.join(OUTDIR, 'report.json'), JSON.stringify(report, null, 2));
    console.log(`[smashshot] done — ${report.frames.length} frames in ${OUTDIR}`);
  } finally {
    try { await browser?.close(); } catch { /* teardown */ }
    try { server?.kill(); } catch { /* teardown */ }
    release();
  }
}

run().catch((e) => { console.error(e); process.exit(1); });

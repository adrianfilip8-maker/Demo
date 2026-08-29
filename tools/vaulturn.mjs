#!/usr/bin/env node
/**
 * vaulturn.mjs — §730's instrument: a canopic jar in the treasure room, broken by WALKING there
 * and swinging the cane, at both grades, with the `?vault=barrels` arm run through the URL.
 *
 * What "the real path" means here, and it is smashshot.mjs's meaning verbatim (§435.4): the
 * player is walked from spawn along the level's OWN authored route — `Architecture.api.route`,
 * leg by leg, through `input.move` — down both tomb stair flights and through the vault gate,
 * and the attack is pressed through `Input._press`, the seam every device path calls. The combo
 * state machine winds up, publishes `caneHit`, and Smashables resolves it. Nothing teleports,
 * nothing pokes `_break`, and the position the swing is made from is the position locomotion
 * left the player in.
 *
 * The claims it exists to photograph and measure:
 *   · the two vault jars render the PROCEDURAL canopic jar, and the crate 0.9 m away does not;
 *   · a swing there publishes `material: 'stone'` for the urns and `'wood'` for the crate —
 *     which is the shard recipe AND the break sound in one tag;
 *   · the same walk under `?vault=barrels` finds barrels and publishes `'wood'` for all three;
 *   · a jar OUTSIDE the room (the descent landing, one leg back up the route) still publishes
 *     `'wood'` on both arms — the §418.3 failing input, driven rather than described.
 *
 * Frames are shot for verification only, at the owner's request; there is no presentation set.
 *
 *   node tools/vaulturn.mjs                  the default arm, one boot, into shots/vault730/
 *   node tools/vaulturn.mjs --arms both      also walk the ?vault=barrels arm (second boot)
 *   CAMDOT=0 node tools/vaulturn.mjs         pre-flight prints but does not refuse
 *
 * ── NOT YET RUN TO COMPLETION, and §418.9 says to write that down ───────────────────────────
 * The first attempt got as far as the browser confirming the bodies (quoted in §730.9) and then
 * spent 4.6 minutes inside the FIRST walk leg without returning; the hold was abandoned rather
 * than kept, because another lane was queued on the lock behind it. The repairs are in
 * `walkToVault`'s header and in `--arms`. **The walked break is therefore not evidence yet.**
 */
import { chromium } from 'playwright';
import { acquire } from './lock.mjs';
import { spawn, execFileSync } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import net from 'node:net';

const ROOT = path.resolve(import.meta.dirname, '..');
const argv = process.argv.slice(2);
const opt = (n, d) => { const i = argv.indexOf(`--${n}`); if (i < 0) return d; const v = argv[i + 1]; argv.splice(i, 2); return v; };
const OUTDIR = path.resolve(ROOT, opt('out', 'shots/vault730'));
const W = +opt('w', 1280), H = +opt('h', 720);
/* One arm by default — see walkToVault's header for why the token half is not worth a second
   boot on a contended lock. `--arms both` runs the ?vault=barrels walk as well. */
const ARMS_OPT = String(opt('arms', 'default')).toLowerCase();

const sha = () => { try { return execFileSync('git', ['rev-parse', '--short', 'HEAD'], { cwd: ROOT }).toString().trim(); } catch { return '(no git)'; } };

/* Every line is stamped with elapsed seconds. The first run of this tool was pipelined into
   `head -22`, which buffered the whole thing and then truncated it, and there was no way to tell
   a slow BOOT from a stuck WALK from the outside. A capture-lock hold that cannot be diagnosed
   while it is running is a hold that gets killed and repeated. */
const T0 = Date.now();
const say = (s) => { process.stdout.write(`[${((Date.now() - T0) / 1000).toFixed(1).padStart(7)}s] ${s}\n`); };
const say2 = (...a) => say(a.join(' '));

async function freePort(start = 5710) {
  for (let p = start; p < start + 300; p++) {
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
  const proc = spawn(bin, ['--port', String(port), '--strictPort', '--host', '127.0.0.1'],
    { cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, NO_COLOR: '1', SANDS_NO_HMR: '1' } });
  let log = '';
  proc.stdout.on('data', (d) => { log += d; });
  proc.stderr.on('data', (d) => { log += d; });
  const deadline = Date.now() + 60000;
  while (Date.now() < deadline) {
    if (/localhost:\d+|ready in/i.test(log)) break;
    if (proc.exitCode !== null) throw new Error(`vite exited (${proc.exitCode}):\n${log}`);
    await new Promise((r) => setTimeout(r, 250));
  }
  return proc;
}

/* The page library. Walk and swing are smashshot.mjs's, unchanged in shape — a second, differently
   felt drive is exactly the drift this project refuses elsewhere. No backticks below this line. */
const LIB = `
window.__vt = (() => {
  const E = window.__ENGINE, G = window.__GAME;
  E.stopLoop();
  G.hideHud(true);
  const dbg = E.debugTools;
  const pump = (n = 1) => { for (let i = 0; i < n; i++) E.renderFrame(0); };
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
  const pos = () => {
    const p = E.get('movement').position;
    return [+p.x.toFixed(2), +p.y.toFixed(2), +p.z.toFixed(2)];
  };
  const walkTo = (pt, stop = 1.2, maxFrames = 1400, jumpEvery = 0) => {
    const mv = E.get('movement');
    const dist = () => Math.hypot(mv.position.x - pt[0], mv.position.z - pt[2]);
    let sign = -1, d0 = dist(), frames = 0;
    drive(12, 1 / 60, { my: sign, aimAt: pt });
    if (dist() > d0 - 0.02) { sign = 1; }
    let stall = 0, last = dist();
    while (dist() > stop && frames < maxFrames) {
      drive(1, 1 / 60, { my: sign, aimAt: pt }); frames++;
      const d = dist();
      if (d > last - 0.005) stall++; else { stall = 0; last = d; }
      if (jumpEvery && stall > 0 && frames % jumpEvery === 0) {
        E.input._press('jump', 'key');
        drive(2, 1 / 60, { my: sign, aimAt: pt }); frames += 2;
        E.input._release('jump', 'key');
      }
    }
    drive(6, 1 / 60, { my: 0 });
    return { frames, dist: +dist().toFixed(3), at: pos(), arrived: dist() <= stop };
  };
  /* settle: stand still until the capsule stops moving, so the swing is made from a settled
     stance rather than mid-fall (§435.4's second half) */
  const settle = (n = 90) => {
    const mv = E.get('movement');
    let prev = mv.position.y, still = 0;
    for (let i = 0; i < n && still < 12; i++) {
      drive(1, 1 / 60, { my: 0 });
      if (Math.abs(mv.position.y - prev) < 1e-4) still++; else still = 0;
      prev = mv.position.y;
    }
    return { at: pos(), grounded: !!mv.grounded, state: mv.stateName };
  };
  const swing = (frames = 40) => {
    const before = window.__VTEV.length;
    E.input._press('attack', 'key');
    drive(2, 1 / 60, { my: 0 });
    E.input._release('attack', 'key');
    drive(frames, 1 / 60, { my: 0 });
    return { events: window.__VTEV.slice(before), from: pos(), state: E.get('movement').stateName };
  };
  const cam = (p, t) => {
    E.debug.freeCam = true;
    E.camera.position.set(...p);
    E.camera.lookAt(...t);
    E.camera.updateMatrixWorld(true);
    pump(2);
  };
  const camOff = () => { E.debug.freeCam = false; };
  const grab = () => {
    const png = G.capture();
    return png;
  };
  const toggleGrade = () => {
    window.__PAD.press(4); pump(1); window.__PAD.release(4); pump(1);
    let n = 0; while (dbg._dnActive && n < 400) { pump(1); n++; }
    return { frames: n, tod: +E.debug.timeOfDay.toFixed(4) };
  };
  /* what Smashables says it did, and what the meshes actually are */
  const bodies = () => {
    const sm = E.get('smashables');
    const meshes = sm.root.children.map((c) => {
      c.geometry.computeBoundingBox();
      const bb = c.geometry.boundingBox;
      return { name: c.name, count: c.count, mat: c.material.name || '(none)',
               verts: c.geometry.attributes.position.count,
               h: +(bb.max.y - bb.min.y).toFixed(4), w: +(bb.max.x - bb.min.x).toFixed(4) };
    });
    return { info: sm.debugInfo(), meshes };
  };
  window.__VTEV = [];
  E.on('propSmashed', (p) => window.__VTEV.push({
    x: +p.pos.x.toFixed(3), y: +p.pos.y.toFixed(3), z: +p.pos.z.toFixed(3),
    material: p.material, scale: p.scale,
  }));
  return { E, G, dbg, pump, drive, pos, walkTo, settle, swing, cam, camOff, grab, toggleGrade, bodies };
})();
`;

const PAD_INIT = `
  (() => {
    const pad = { index: 0, id: 'vaulturn synthetic DS4', mapping: 'standard', connected: true,
      axes: [0, 0, 0, 0],
      buttons: Array.from({ length: 17 }, () => ({ pressed: false, value: 0, touched: false })),
      timestamp: 0 };
    window.__PAD = { pad,
      press(i) { pad.buttons[i] = { pressed: true, value: 1, touched: true }; pad.timestamp++; },
      release(i) { pad.buttons[i] = { pressed: false, value: 0, touched: false }; pad.timestamp++; } };
    Object.defineProperty(navigator, 'getGamepads', { value: () => [pad], configurable: true });
  })();
`;

async function boot(browser, port, query) {
  const page = await browser.newPage({ viewport: { width: W, height: H } });
  page.on('pageerror', (e) => say2('  [pageerror]', e.message));
  await page.addInitScript(PAD_INIT);
  await page.goto(`http://127.0.0.1:${port}/${query}`, { waitUntil: 'domcontentloaded', timeout: 120000 });
  await page.waitForFunction('window.__GAME && window.__GAME.ready === true', null, { timeout: 600000, polling: 500 });
  await page.evaluate(LIB);
  return page;
}

/**
 * Walk the authored route from spawn to the treasure room, leg by leg, and report each.
 *
 * ── What the first attempt cost, and why these numbers are what they are ────────────────────
 * The first run of this walked 7 legs at `maxFrames 1400` with `jumpEvery 24` on EVERY leg, and
 * the first leg had not returned after 4.6 minutes of wall time — a projected 45+ minutes for
 * both arms, on a capture lock another lane was queued behind. That hold was abandoned rather
 * than kept, and this is the repair:
 *
 *   · `jumpEvery` is now PER LEG. A jump pulse is only correct where a mantle is actually
 *     needed — the two terrace risers and the tomb descent — and on the long flat legs
 *     (hall-floor, inner-gate) it fired ~58 times per leg for nothing, each one a fresh press
 *     through the input seam with the FX and audio that follow it.
 *   · `maxFrames` drops 1400 → 900, which is `smashshot.mjs`'s own budget for the same drive.
 *   · every leg prints its WALL time as well as its frame count, so the next reader can tell a
 *     slow container from a stuck drive without guessing — which is exactly what could not be
 *     told the first time.
 *   · `--arms default` (the default) runs ONE arm. The `?vault=barrels` half is already proven
 *     headlessly by `vaulturn.test.mjs` U2/U4 and by `smashswap` W1/W2 under the token, so
 *     spending a second browser boot and a second full walk on it is not worth a contended
 *     lock. `--arms both` opts back in.
 */
const LEG_JUMP = { 'terrace-1': 24, 'terrace-2': 24, 'descent-landing': 0, 'vault-floor': 30 };

async function walkToVault(page, route, target) {
  const legs = ['terrace-1', 'terrace-2', 'hall-floor', 'inner-gate', 'descent-landing', 'vault-floor'];
  const out = [];
  for (const name of legs) {
    const w = route.find((r) => r[0] === name);
    if (!w) continue;
    const t0 = Date.now();
    const jump = LEG_JUMP[name] ?? 0;
    const r = await page.evaluate(([pt, j]) => window.__vt.walkTo(pt, 1.6, 900, j), [[w[1], w[2], w[3]], jump]);
    const secs = (Date.now() - t0) / 1000;
    out.push({ leg: name, jump, secs: +secs.toFixed(1), ...r });
    say2(`      ${name.padEnd(16)} ${r.arrived ? 'arrived' : 'STOPPED'}  ${String(r.frames).padStart(4)} frames in ${secs.toFixed(1)}s `
      + `(${(1000 * secs / Math.max(1, r.frames)).toFixed(0)} ms/frame)  ${r.dist} m out  at ${JSON.stringify(r.at)}`);
  }
  const t1 = Date.now();
  const r = await page.evaluate(([pt]) => window.__vt.walkTo(pt, 1.0, 600, 0), [target]);
  const s1 = (Date.now() - t1) / 1000;
  out.push({ leg: 'urn', secs: +s1.toFixed(1), ...r });
  say2(`      ${'urn'.padEnd(16)} ${r.arrived ? 'arrived' : 'STOPPED'}  ${String(r.frames).padStart(4)} frames in ${s1.toFixed(1)}s  ${r.dist} m out  at ${JSON.stringify(r.at)}`);
  const s = await page.evaluate(() => window.__vt.settle());
  say2(`      settled at ${JSON.stringify(s.at)}  grounded=${s.grounded}  state=${s.state}`);
  return { legs: out, settled: s };
}

async function run() {
  await mkdir(OUTDIR, { recursive: true });

  /* ---- everything that can be decided in Node is decided BEFORE the lock is taken ---- */
  const { authorSmashables } = await import(path.join(ROOT, 'src/world/Smashables.js'));
  const { inCrypt, L } = await import(path.join(ROOT, 'src/world/EgyptLevel.js'));
  const src = (await import('node:fs')).readFileSync(path.join(ROOT, 'src/world/EgyptLevel.js'), 'utf8');
  const m = src.match(/api\.route\s*=\s*\[([\s\S]*?)\n\s*\];/);
  const route = [];
  for (const w of m[1].matchAll(/\[\s*'([^']+)'\s*,\s*(-?[\d.]+)\s*,\s*(-?[\d.]+)\s*,\s*(-?[\d.]+)\s*\]/g)) {
    route.push([w[1], +w[2], +w[3], +w[4]]);
  }
  const specs = authorSmashables(route);
  const vault = specs.filter((s) => inCrypt(s));
  const urn = vault.find((s) => s.kind === 'jar');
  const vaultCrate = vault.find((s) => s.kind === 'crate');
  const outsideJar = specs.find((s) => s.at === 'descent-landing' && s.kind === 'jar');
  if (!urn || !vaultCrate || !outsideJar) throw new Error('the shipped seed no longer places a vault jar / vault crate / landing jar');
  say2(`[vaulturn] treasure room census at the shipped seed: ${vault.length} spots — `
    + Object.entries(vault.reduce((a, s) => ((a[s.kind] = (a[s.kind] || 0) + 1), a), {})).map(([k, v]) => `${v} ${k}`).join(', '));
  for (const s of vault) say2(`             ${s.kind.padEnd(6)} (${s.x.toFixed(3)}, ${s.y}, ${s.z.toFixed(3)})  at '${s.at}'`);
  say2(`[vaulturn] control (outside the room): ${outsideJar.kind} at '${outsideJar.at}' (${outsideJar.x.toFixed(2)}, ${outsideJar.y}, ${outsideJar.z.toFixed(2)})`);

  const target = [urn.x, urn.y, urn.z];
  const report0 = {};
  say2('[vaulturn] camDot pre-flight (in-Node, §604) — sweeping radius, eye height and azimuth');
  const { camDot } = await import('./camdot.mjs');
  /* Radius is swept as well as azimuth, and it has to be: the burial chamber is a PILLARED
     crypt — `arch:tomb:granite_pink` piers stand at z -62 / -68 / -74, and the urns are at
     z -72.2, so at 4 m every azimuth puts a 2.2 m pier between the camera and the pot. The
     subject is 0.6 m tall, so a close stance is the better picture anyway; the sweep is what
     discovers that rather than a number typed here (§604). */
  /**
   * TWO subjects are swept, and which one the frame lands on is discovered rather than chosen.
   *
   *   `urn`   — a destructible vault jar. This is what the break is driven against.
   *   `table` — the westmost of the four offering-table canopic jars, §730's STATIC half. It is
   *             the more photogenic of the two if it passes, and it is arguably the site the
   *             owner was looking at: four canopic jars on an Egyptian offering table, which
   *             §729 turned into four small barrels.
   *
   * The destructible cluster is authored in a 0.85 m ring about the `sarcophagus` waypoint,
   * which is `L.tomb.sarc` = (0, -12, -72) — i.e. ON the sarcophagus. So those two jars stand
   * hard against a waist-high granite box in a room whose piers are at z -62/-68/-74, and a
   * clean lens on them may simply not exist. That is a fact about the SEED, not about §730, and
   * it is recorded either way.
   */
  /* The offering-table mount, derived the way `Props._tomb` derives it (vault at (0, -12, -72),
     the westmost jar at x -2.6, seated 0.62 above the floor, 2.4 m south of the sarcophagus)
     rather than typed as three literals. `L.tomb.sarc` is the same point from the level's side. */
  const V = { x: L.tomb.sarc[0], y: L.tomb.sarc[1], z: L.tomb.sarc[2] };
  const SUBJECTS = [
    ['table', [V.x - 2.6, V.y + 0.62, V.z + 2.4], 0.30],
    ['urn', target, 0.30],
  ];
  let stance = null;
  const tried = [];
  const sweptFor = {};
  outer:
  for (const [subj, at, lookUp] of SUBJECTS) {
    const before = tried.length;
    for (const r of [1.5, 1.9, 2.3, 2.8, 3.4, 4.0]) {
      for (const eye of [1.1, 0.8, 1.45]) {
        for (let deg = 0; deg < 360; deg += 15) {
          const a = deg * Math.PI / 180;
          const p = [at[0] + Math.sin(a) * r, at[1] + eye, at[2] + Math.cos(a) * r];
          const t = [at[0], at[1] + lookUp, at[2]];
          const d = await camDot(p, t);
          tried.push({ subj, r, eye, deg, ok: d.ok, near: d.near, nearest: d.nearest, forward: d.forward,
                       forwardName: d.forwardName, blocked: d.subjectBlocked, reasons: d.reasons });
          if (d.ok) {
            say2(`    PASS on '${subj}'  r ${r.toFixed(1)}  eye ${eye.toFixed(2)}  az ${String(deg).padStart(3)}  `
              + `enclosed ${d.near}/${d.dirs}  nearest ${d.nearest}  forward ${d.forward}`);
            stance = { subj, pos: p, target: t, deg, r, eye };
            break outer;
          }
        }
      }
    }
    sweptFor[subj] = tried.length - before;
    say2(`    '${subj}': ${tried.length - before} stances swept, none passed`);
  }
  report0.sweep = { tried: tried.length, passed: tried.filter((x) => x.ok).length, perSubject: sweptFor };
  if (!stance) {
    /* Nothing passed. Print WHY, ranked, because "no clean stance exists" is a fact about the
       room and belongs in the record: the burial chamber is a pillared crypt whose piers stand
       at z -62 / -68 / -74 with the urns at z -72.2, and it is also full of §724's pile, the
       sarcophagus, the coffin lid, the offering table and the falcon Ra. */
    const why = {};
    for (const t of tried) for (const r of t.reasons) why[r.split(':')[0]] = (why[r.split(':')[0]] || 0) + 1;
    say2(`    no stance passed out of ${tried.length} swept. Refusal census:`);
    for (const [k, v] of Object.entries(why).sort((a, b) => b[1] - a[1])) say2(`      ${String(v).padStart(4)}  ${k}`);
    const best = tried.filter((x) => x.reasons.length === 1 && x.reasons[0].startsWith('SUBJECT'))
      .sort((a, b) => (b.forward ?? 0) - (a.forward ?? 0))[0];
    if (best) {
      say2(`    least-occluded single-fault stance: r ${best.r} eye ${best.eye} az ${best.deg} — `
        + `${best.forwardName} at ${best.forward} m in front of a ${(best.r).toFixed(1)} m subject`);
    }
    if (process.env.CAMDOT !== '0') {
      throw new Error('[vaulturn] no swept stance passed camDot — refusing to photograph blind. '
        + 'Re-run with CAMDOT=0 only if the refusal above is understood and recorded.');
    }
    const a = (best?.deg ?? 0) * Math.PI / 180, r = best?.r ?? 2.3, eye = best?.eye ?? 1.1;
    stance = { pos: [target[0] + Math.sin(a) * r, target[1] + eye, target[2] + Math.cos(a) * r],
               target: [target[0], target[1] + 0.3, target[2]], deg: best?.deg ?? 0, r, eye,
               camdotOverridden: true, refusal: best?.reasons ?? ['(no single-fault stance)'] };
    say2('    CAMDOT=0 — proceeding on the least-occluded stance above, recorded as overridden.');
  }

  say2('\n[vaulturn] waiting for capture lock…');
  const release = await acquire({ onWait: (ms) => process.stdout.write(`· queued for the capture lock (${(ms / 1000) | 0}s)\n`) });
  let server = null, browser = null, bad = 0;
  const report = { sha: sha(), when: new Date().toISOString(), census: vault, stance, ...report0, arms: {} };
  try {
    const port = await freePort();
    server = await startServer(port);
    browser = await chromium.launch({
      executablePath: ['/opt/pw-browsers/chromium', '/usr/bin/chromium', '/usr/bin/chromium-browser'].find(existsSync),
      args: ['--no-sandbox', '--disable-dev-shm-usage', '--use-gl=angle', '--use-angle=swiftshader',
        '--enable-unsafe-swiftshader', '--enable-webgl', '--ignore-gpu-blocklist', '--disable-frame-rate-limit',
        '--js-flags=--max-old-space-size=4096', '--force-device-scale-factor=1', '--hide-scrollbars', '--mute-audio'],
    });

    const ARMS = ARMS_OPT === 'both'
      ? [['default', ''], ['barrels', '?vault=barrels']]
      : [['default', '']];
    for (const [arm, query] of ARMS) {
      say2(`\n=== arm: ${arm}${query ? '  ' + query : ''} ===`);
      const page = await boot(browser, port, query);
      const b = await page.evaluate(() => window.__vt.bodies());
      const A = report.arms[arm] = { bodies: b, walk: null, breaks: {}, frames: [] };
      say2(`    meshes: ${b.meshes.map((x) => `${x.name}[${x.count}] ${x.mat} h=${x.h} w=${x.w} v=${x.verts}`).join('  |  ')}`);
      say2(`    debugInfo().vault = ${JSON.stringify(b.info.vault.byKind)}  urns=${b.info.vault.urns}  spots=${b.info.vault.spots}`);

      say2('    walking the authored route from spawn to the treasure room:');
      A.walk = await walkToVault(page, route, target);
      if (!A.walk.legs[A.walk.legs.length - 1].arrived) { say2('    !! the walk did not reach the urn'); bad++; }

      /* the swing, and the day frame */
      await page.evaluate(([p, t]) => window.__vt.cam(p, t), [stance.pos, stance.target]);
      const before = await page.evaluate(() => window.__vt.grab());
      const sw = await page.evaluate(() => window.__vt.swing());
      A.breaks.day = sw.events;
      say2(`    swing from ${JSON.stringify(sw.from)} (state ${sw.state}) -> ${sw.events.length} propSmashed:`);
      for (const e of sw.events) say2(`        (${e.x}, ${e.y}, ${e.z})  material=${e.material}  scale=${e.scale}`);
      await page.evaluate(([p, t]) => window.__vt.cam(p, t), [stance.pos, stance.target]);
      const after = await page.evaluate(() => window.__vt.grab());
      for (const [n, png] of [[`${arm}-day-before`, before], [`${arm}-day-after`, after]]) {
        await writeFile(path.join(OUTDIR, `${n}.png`), Buffer.from(png.split(',')[1], 'base64'));
        A.frames.push(`${n}.png`);
      }

      /* the night grade, through the L1 pad tap — the break stays broken across it */
      const g = await page.evaluate(() => window.__vt.toggleGrade());
      say2(`    L1 tap -> tod ${g.tod} over ${g.frames} frames`);
      await page.evaluate(([p, t]) => window.__vt.cam(p, t), [stance.pos, stance.target]);
      const night = await page.evaluate(() => window.__vt.grab());
      await writeFile(path.join(OUTDIR, `${arm}-night-after.png`), Buffer.from(night.split(',')[1], 'base64'));
      A.frames.push(`${arm}-night-after.png`);
      A.nightTod = g.tod;

      /* the §418.3 failing input, DRIVEN: a jar outside the room, same walk, same swing */
      await page.evaluate(() => window.__vt.camOff());
      const back = await page.evaluate(([pt]) => window.__vt.walkTo(pt, 1.0, 1400, 24),
        [[outsideJar.x, outsideJar.y, outsideJar.z]]);
      say2(`    control walk back to the '${outsideJar.at}' jar: ${back.arrived ? 'arrived' : 'STOPPED'} ${back.frames} frames, ${back.dist} m out, at ${JSON.stringify(back.at)}`);
      await page.evaluate(() => window.__vt.settle());
      const sw2 = await page.evaluate(() => window.__vt.swing());
      A.breaks.outside = sw2.events;
      say2(`    control swing -> ${sw2.events.length} propSmashed: ${sw2.events.map((e) => e.material).join(', ') || '(none)'}`);
      await page.close();
    }

    /* ---- the verdict, from the two arms' payloads ---- */
    say2('\n=== verdict ===');
    const d = report.arms.default, bl = report.arms.barrels;
    const mats = (evs) => evs.map((e) => e.material).sort();
    say2(`  default  vault break materials: ${JSON.stringify(mats(d.breaks.day))}`);
    say2(`  default  outside-room jar:      ${JSON.stringify(mats(d.breaks.outside))}`);
    if (!mats(d.breaks.day).includes('stone')) { say2('  !! no urn in the vault broke as stone on the default arm'); bad++; }
    if (mats(d.breaks.outside).includes('stone')) { say2('  !! a jar outside the treasure room broke as stone — the policy has gone global'); bad++; }
    const dUrn = d.bodies.meshes.find((x) => x.name === 'smashable_jar_urn');
    say2(`  urn mesh: default ${dUrn ? `${dUrn.count} on ${dUrn.mat}` : 'ABSENT'}`);
    if (!dUrn) { say2('  !! the default arm built no urn mesh'); bad++; }
    if (bl) {
      say2(`  barrels  vault break materials: ${JSON.stringify(mats(bl.breaks.day))}`);
      say2(`  barrels  outside-room jar:      ${JSON.stringify(mats(bl.breaks.outside))}`);
      if (mats(bl.breaks.day).includes('stone')) { say2('  !! ?vault=barrels still broke something as stone'); bad++; }
      const bUrn = bl.bodies.meshes.find((x) => x.name === 'smashable_jar_urn');
      say2(`  urn mesh: barrels ${bUrn ? `${bUrn.count} on ${bUrn.mat}` : 'absent (correct)'}`);
      if (bUrn) { say2('  !! the urn mesh is not gated by the token'); bad++; }
    } else {
      say2('  barrels arm not run (--arms default) — the token half is covered headlessly by '
        + 'vaulturn.test.mjs U2/U4 and smashswap W1/W2');
    }

    await writeFile(path.join(OUTDIR, 'report.json'), JSON.stringify(report, null, 2));
    say2(`\n[vaulturn] report -> ${path.relative(ROOT, OUTDIR)}/report.json   sha ${report.sha}`);
    say2(bad ? `\nVERDICT: ${bad} problem(s)` : '\nVERDICT: the vault urns break as clay, the token puts the barrels back, and nothing outside the room moved');
    if (bad) process.exitCode = 1;
  } finally {
    await browser?.close().catch(() => {});
    server?.kill('SIGTERM');
    setTimeout(() => server?.kill('SIGKILL'), 3000);
    release();
  }
}

run().catch((e) => { console.error(e); process.exit(1); });

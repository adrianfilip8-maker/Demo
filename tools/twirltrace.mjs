#!/usr/bin/env node
/**
 * twirltrace.mjs — why does the double jump look like the single jump? (user playtest P1)
 *
 * `Clips.js` authors a 0.62 s cane twirl (`double_jump` — "The cane channel does the 360; the
 * body only needs to sell that the twirl is what lifted him") and `Moveset.DoubleJump.enter`
 * fires it. This instrument logs, per sim frame through a driven single jump and a driven double
 * jump ON THE SHIPPED MODEL (`?char=` default = SlyModelDLRig), the things the screen is actually
 * made of, not the things the routing table promises (§442.3, §439):
 *
 *   · the Animation track table — clip name, weight, target, loop/ending flags, playhead —
 *     so "the oneShot fired" and "the oneShot delivered" stop being the same claim;
 *   · the cane's WORLD orientation, read from the caneSocket/attach pivot's matrixWorld
 *     (shaft = +Y column, hook = +Z column), summed frame-to-frame into a cumulative sweep —
 *     the twirl IS this number (~360°); a cane rigid in a tucking hand is ~40-80°;
 *   · `handR`'s world sweep beside it, so "the cane turned because the arm did" and "the cane
 *     turned relative to the hand" are separable;
 *   · `Animation.canePivot` presence — the single boolean that decides whether ANY clip's cane
 *     track can reach this model at all;
 *   · engine warnings matching /ANIM|clip/ — a name/case miss dies as a warn, not a throw.
 *
 * Run:  node tools/twirltrace.mjs           (960x540 Q=high, shots/twirl1/)
 *       LABEL=after node tools/twirltrace.mjs   — same drive, frames prefixed `after-`
 *
 * Captures are 1080p only for the committed look frames (LOOK=1); telemetry frames are free
 * (camlook's fast sim step — sim without render, pixels only on capture).
 */
import { chromium } from 'playwright';
import { acquire } from './lock.mjs';
import { spawn, execFileSync } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import net from 'node:net';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const OUT = process.env.OUT || `${ROOT}/shots/twirl1`;
const W = Number(process.env.W || 1920), H = Number(process.env.H || 1080);
const Q = process.env.Q || 'high';
const LABEL = process.env.LABEL || 'before';

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
const release = await acquire('look2-twirl');
console.log(`[twirl] lock · sha ${sha}${dirty ? ` · DIRTY\n${dirty}` : ' · clean'} · label ${LABEL}`);

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

const takes = {};
try {
  await page.goto(`http://127.0.0.1:${port}/?shot=1&q=${Q}`, { waitUntil: 'domcontentloaded', timeout: 120000 });
  await page.waitForFunction('window.__GAME && window.__GAME.ready === true', null, { timeout: 600000, polling: 500 });
  console.log('[twirl] ready');
  await page.evaluate(() => {
    window.__ENGINE.stopLoop();
    window.__GAME.hideHud(true);
    window.__ENGINE.debug.freeCam = false;
    window.__ENGINE.input.locked = true;   // §467/§468: keep the click gate out of the way
    const e = window.__ENGINE;
    window.__simStep = (n, dt) => {        // camlook's fast step: sim without pixels
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
  const sim = (n = 1) => page.evaluate((k) => window.__simStep(k, 1 / 60), n);

  /* The mechanism probe. Everything here is a read of live module state; nothing is derived. */
  const probe = () => page.evaluate(() => {
    const e = window.__ENGINE, m = e.get('movement'), a = e.get('animation'), ch = e.get('character');
    const col = (o, i) => { // unit column i of a matrixWorld — no THREE needed on the page
      const el = o.matrixWorld.elements, x = el[i], y = el[i + 1], z = el[i + 2];
      const L = Math.hypot(x, y, z) || 1; return [x / L, y / L, z / L];
    };
    let cane = null, hand = null;
    const sock = ch?.root?.getObjectByName?.('caneSocket') || a?.canePivot || null;
    if (sock) { sock.updateWorldMatrix(true, false); cane = { shaft: col(sock, 4), hook: col(sock, 8) }; }
    const hb = ch?.bones?.handR;
    if (hb) { hb.updateWorldMatrix(true, false); hand = { x: col(hb, 0), y: col(hb, 4) }; }
    return {
      st: m?.stateName, gr: !!m?.grounded, vy: +(m?.velocity?.y ?? 0).toFixed(2),
      aj: m?.airJumps, base: m?._baseClip ?? null,
      treeW: +(a?.treeW ?? 1).toFixed(3),
      pivot: !!a?.canePivot,
      tracks: (a?.tracks || []).filter((t) => t.clip).map((t) => ({
        n: t.clip.name, w: +t.w.toFixed(3), tg: t.target, lp: t.loop ? 1 : 0,
        end: t.ending ? 1 : 0, t: +t.time.toFixed(3),
      })),
      cane, hand,
    };
  });

  const snap = async (name) => {
    const uri = await page.evaluate(() => window.__GAME.capture('image/png'));
    await writeFile(`${OUT}/${LABEL}-${name}.png`, Buffer.from(uri.split(',')[1], 'base64'));
    console.log(`      -> ${LABEL}-${name}.png`);
  };
  const reset = async (home) => {
    await page.evaluate(([x, y, z]) => {
      const m = window.__ENGINE.get('movement');
      m.position.set(x, y, z + 10); m.velocity.set(0, 0, 0);   // open desert behind spawn (camlook S1)
    }, home);
    await sim(30);
  };

  await sim(30);
  const home = await page.evaluate(() => {
    const m = window.__ENGINE.get('movement');
    return [m.position.x, m.position.y, m.position.z];
  });
  console.log(`[twirl] spawn at ${home.map((v) => v.toFixed(1)).join(', ')}`);

  /** Drive one take. `dj` = press jump a second time in the air. Logs every frame. */
  const take = async (tag, dj, shotAt) => {
    console.log(`[${tag}] run + jump${dj ? ' + AIR JUMP' : ''}`);
    await reset(home);
    const rows = [];
    let f = 0, djAt = -1;
    const rec = async (ev) => { const s = await probe(); rows.push({ f, ev: ev || null, ...s }); };
    await page.keyboard.down('KeyW');
    await sim(30);
    await page.keyboard.down('Space');
    await rec('jump-press');
    for (let i = 0; i < 8; i++) { await sim(1); f++; await rec(); }
    await page.keyboard.up('Space');
    for (let i = 0; i < 6; i++) { await sim(1); f++; await rec(); }
    if (dj) {
      await page.keyboard.down('Space');
      await rec('dj-press');
      djAt = f;
      for (let i = 0; i < 4; i++) { await sim(1); f++; await rec(); }
      await page.keyboard.up('Space');
    }
    for (let i = 0; i < 110; i++) {
      await sim(1); f++;
      const s = await probe(); rows.push({ f, ...s });
      const at = (djAt >= 0 ? f - djAt : f);
      if (shotAt.includes(at)) await snap(`${tag}-f${at}`);
      if (s.gr && !['jump', 'doubleJump', 'fall', 'land'].includes(s.st) && f > 20) break;
    }
    await page.keyboard.up('KeyW');
    await sim(20);
    takes[tag] = rows;
  };

  /* Frames chosen against the clip's own keys: 0.16 s = f10, 0.34 s = f20, 0.62 s = f37. */
  await take('single', false, [8, 16]);
  await take('double', true, [2, 10, 16, 20, 26, 34]);

  takes.warnings = await page.evaluate(() =>
    (window.__ENGINE.warnings || []).filter((w) => /ANIM|clip|cane/i.test(String(w))));

  /* ---- analysis: the numbers the ledger quotes ------------------------------------------- */
  const sweep = (rows, key, from, to) => {
    let sum = 0, prev = null;
    for (const r of rows) {
      if (r.f < from || r.f > to) continue;
      const d = key === 'cane' ? r.cane?.hook : r.hand?.y;
      if (!d) continue;
      if (prev) {
        const dot = Math.max(-1, Math.min(1, d[0] * prev[0] + d[1] * prev[1] + d[2] * prev[2]));
        sum += Math.acos(dot) * 180 / Math.PI;
      }
      prev = d;
    }
    return +sum.toFixed(1);
  };
  /* NET signed yaw about world Y of the cane's hook direction — the discriminator. Cumulative
     sweep saturates on wiggle (a plain single jump accumulates ~270° of arm motion); net
     cancels wiggle and keeps rotation. Same metric and same 270/120 bars as
     `tests/twirl.test.mjs` T1/T2. */
  const netYaw = (rows, from, to) => {
    let sum = 0, prev = null;
    for (const r of rows) {
      if (r.f < from || r.f > to || !r.cane?.hook) continue;
      const d = r.cane.hook;
      if (Math.hypot(d[0], d[2]) < 0.2) continue;
      const a = Math.atan2(d[2], d[0]);
      if (prev !== null) {
        let da = a - prev;
        if (da > Math.PI) da -= 2 * Math.PI;
        if (da < -Math.PI) da += 2 * Math.PI;
        sum += da;
      }
      prev = a;
    }
    return +(sum * 180 / Math.PI).toFixed(1);
  };
  const trackLife = (rows, name) => {
    let first = -1, last = -1, wMax = 0, frames50 = 0, cutBy = null, promoted = 0;
    for (const r of rows) {
      const tr = r.tracks.find((t) => t.n === name);
      if (!tr) continue;
      if (first < 0) first = r.f;
      last = r.f; wMax = Math.max(wMax, tr.w);
      if (tr.w > 0.5) frames50++;
      if (tr.lp) promoted = 1;
      if (tr.end && !cutBy) {
        const nb = r.tracks.filter((t) => t.n !== name && t.lp && !t.end).map((t) => t.n);
        cutBy = { f: r.f, t: tr.t, by: nb.join('+') || '(time)' };
      }
    }
    return { first, last, wMax, frames50, promoted, cutBy };
  };
  for (const tag of ['single', 'double']) {
    const rows = takes[tag];
    const dj = trackLife(rows, 'double_jump');
    const jr = trackLife(rows, 'jump_rise');
    const air = rows.filter((r) => !r.gr);
    const a0 = air.length ? air[0].f : 0, a1 = air.length ? air[air.length - 1].f : 0;
    console.log(`[${tag}] airborne f${a0}-f${a1} · pivot ${rows[0].pivot}`
      + ` · cane sweep ${sweep(rows, 'cane', a0, a1)} deg · handR sweep ${sweep(rows, 'hand', a0, a1)} deg`
      + ` · NET cane yaw ${netYaw(rows, a0, a1)} deg`);
    console.log(`   jump_rise   ${JSON.stringify(jr)}`);
    console.log(`   double_jump ${JSON.stringify(dj)}`);
    takes[`${tag}-summary`] = {
      air: [a0, a1], pivot: rows[0].pivot,
      caneSweepDeg: sweep(rows, 'cane', a0, a1), handSweepDeg: sweep(rows, 'hand', a0, a1),
      netCaneYawDeg: netYaw(rows, a0, a1),
      jump_rise: jr, double_jump: dj,
    };
  }
  if (takes.warnings.length) console.log(`[twirl] anim warnings:\n  ${takes.warnings.join('\n  ')}`);
} finally {
  await writeFile(`${OUT}/telemetry-${LABEL}.json`, JSON.stringify({ sha, dirty, W, H, Q, LABEL, errs, takes }, null, 2));
  await browser.close();
  server.kill('SIGTERM');
  release();
  console.log('[twirl] released');
  if (errs.length) console.log(`[twirl] page errors:\n${errs.slice(0, 8).join('\n')}`);
}

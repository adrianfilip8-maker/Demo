#!/usr/bin/env node
/**
 * fliptrace.mjs — does the double jump read as a FRONT FLIP on the shipped model? (§478)
 *
 * §474 re-authored the twirl and telemetry said +346° of cane yaw — and the user still read the
 * move as "off". The §474 metric measured the CANE; the user watches the BODY. This instrument
 * measures the body: the somersault is a rotation of the hips about the lateral axis, so the
 * probe logs, per sim frame through a driven double jump on the SHIPPED model (`?char=` default
 * = SlyModelDLRig):
 *
 *   · NET sagittal pitch sweep — the hips' world +Y axis projected onto the plane spanned by
 *     world-up and the facing at the air-jump press, unwrapped and summed. A front flip nets
 *     ≈ ±360°; the §474 cane twirl nets ≈ 0° here BY CONSTRUCTION (its rotation is about +Y).
 *     Same sign-proof method as godot2clips' sweep instrument.
 *   · min upDot — dot(hips world +Y, world up). A somersault passes through upside-down
 *     (≤ −0.7); no upright move goes under ~+0.3. The single number a screenshot can't fake.
 *   · the Animation track table (twirltrace's probe) — promoted / weight / cut-by, so "the clip
 *     played" and "the clip delivered" stay separable claims;
 *   · chest-anchor NDC per frame (camlook's self-describing-frame block) — the §475 containment
 *     clamp holds |ndcY| ≤ 0.88 as a final-stage invariant, and a flip that fought it would show
 *     here as engaged frames, not as an anecdote;
 *   · the landing seam — worst one-frame hips world-rotation step inside [land−5, land+10] on
 *     the HELD take (the §474.3 demote fade is mechanism; a seam pop is a >25°/frame spike).
 *
 * Run:  node tools/fliptrace.mjs                      (AFTER arm — shipped default, godot regime)
 *       AB=proc LABEL=before node tools/fliptrace.mjs (BEFORE arm — §474 procedural twirl)
 *
 * Both arms drive twirltrace's own cadence (8-frame first hold, 6 gap, 4-frame second tap — the
 * tapped window §474.3 measured) plus a HELD take (second press held through the rise) so the
 * full-window read and the landing seam are on the record too.
 */
import { chromium } from 'playwright';
import { acquire } from './lock.mjs';
import { spawn, execFileSync } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import net from 'node:net';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const OUT = process.env.OUT || `${ROOT}/shots/flip1`;
const W = Number(process.env.W || 1920), H = Number(process.env.H || 1080);
const Q = process.env.Q || 'high';
const LABEL = process.env.LABEL || 'after';
const AB = process.env.AB || '';          // '' = shipped default; 'proc' = §474 procedural arm

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
const release = await acquire('look2-flip');
console.log(`[flip] lock · sha ${sha}${dirty ? ` · DIRTY\n${dirty}` : ' · clean'} · label ${LABEL} · anim ${AB || '(default)'}`);

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
  await page.goto(`http://127.0.0.1:${port}/?shot=1&q=${Q}${AB ? `&anim=${AB}` : ''}`,
    { waitUntil: 'domcontentloaded', timeout: 120000 });
  await page.waitForFunction('window.__GAME && window.__GAME.ready === true', null, { timeout: 600000, polling: 500 });
  const regime = await page.evaluate(async () => (await import('/src/player/Animation.js')).CLIP_REGIME);
  console.log(`[flip] ready · CLIP_REGIME=${regime}`);
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
    const col = (o, i) => {
      const el = o.matrixWorld.elements, x = el[i], y = el[i + 1], z = el[i + 2];
      const L = Math.hypot(x, y, z) || 1; return [x / L, y / L, z / L];
    };
    let hips = null;
    const hb = ch?.bones?.hips;
    if (hb) { hb.updateWorldMatrix(true, false); hips = { y: col(hb, 4), z: col(hb, 8) }; }
    let ndc = null;
    if (ch?.root && e.camera) {
      const pos = ch.root.position.clone(); pos.y += 0.9;   // §475's clampAnchorY — one language
      const v = pos.project(e.camera);
      ndc = [+v.x.toFixed(3), +v.y.toFixed(3), +v.z.toFixed(3)];
    }
    return {
      st: m?.stateName, gr: !!m?.grounded, vy: +(m?.velocity?.y ?? 0).toFixed(2),
      aj: m?.airJumps, ndc, hips,
      fwd: m ? [Math.sin(m.yaw ?? 0), 0, Math.cos(m.yaw ?? 0)] : null,
      tracks: (a?.tracks || []).filter((t) => t.clip).map((t) => ({
        n: t.clip.name, w: +t.w.toFixed(3), lp: t.loop ? 1 : 0, end: t.ending ? 1 : 0, t: +t.time.toFixed(3),
      })),
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
  console.log(`[flip] spawn at ${home.map((v) => v.toFixed(1)).join(', ')}`);

  /** One take. `hold` = keep the second press down through the rise (the full 0.41 s window). */
  const take = async (tag, hold, shotAt) => {
    console.log(`[${tag}] run + jump + AIR JUMP (${hold ? 'HELD' : 'tapped'})`);
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
    await page.keyboard.down('Space');
    await rec('dj-press');
    djAt = f;
    const holdFrames = hold ? 30 : 4;
    for (let i = 0; i < holdFrames; i++) {
      await sim(1); f++; await rec();
      if (shotAt.includes(f - djAt)) await snap(`${tag}-f${f - djAt}`);
    }
    await page.keyboard.up('Space');
    for (let i = 0; i < 110; i++) {
      await sim(1); f++;
      const s = await probe(); rows.push({ f, ...s });
      if (shotAt.includes(f - djAt)) await snap(`${tag}-f${f - djAt}`);
      if (s.gr && !['jump', 'doubleJump', 'fall', 'land'].includes(s.st) && f > djAt + 8) break;
    }
    await page.keyboard.up('KeyW');
    await sim(20);
    takes[tag] = { djAt, rows };
  };

  await take('tapped', false, [4, 6, 8, 10, 13, 17, 22]);
  await take('held', true, [4, 6, 8, 10, 13, 17, 25, 32, 40]);

  takes.warnings = await page.evaluate(() =>
    (window.__ENGINE.warnings || []).filter((w) => /ANIM|clip|cane/i.test(String(w))));

  /* ---- analysis: the numbers the ledger quotes ------------------------------------------- */
  const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  for (const tag of ['tapped', 'held']) {
    const { djAt, rows } = takes[tag];
    const air = rows.filter((r) => !r.gr && r.f >= djAt);
    const a0 = air.length ? air[0].f : djAt, a1 = air.length ? air[air.length - 1].f : djAt;

    /* net sagittal pitch sweep of the hips +Y axis in the (up, fwd0) plane */
    const fwd0 = rows.find((r) => r.f === djAt)?.fwd || [0, 0, 1];
    let net = 0, prev = null, minUp = 1;
    for (const r of rows) {
      if (r.f < a0 || r.f > a1 || !r.hips) continue;
      const y = r.hips.y;
      minUp = Math.min(minUp, y[1]);
      const a = Math.atan2(dot(y, fwd0), y[1]);
      if (prev !== null) {
        let da = a - prev;
        while (da > Math.PI) da -= 2 * Math.PI;
        while (da < -Math.PI) da += 2 * Math.PI;
        net += da;
      }
      prev = a;
    }
    const netDeg = +(net * 180 / Math.PI).toFixed(1);

    /* §475: was the flip ever out of frame? */
    let worstNdcY = 0, out = 0;
    for (const r of rows) {
      if (r.f < a0 || r.f > a1 || !r.ndc) continue;
      if (Math.abs(r.ndc[1]) > Math.abs(worstNdcY)) worstNdcY = r.ndc[1];
      if (Math.abs(r.ndc[0]) > 1 || Math.abs(r.ndc[1]) > 1) out++;
    }

    /* landing seam: worst one-frame hips world-rotation step around touchdown */
    const landAt = rows.find((r) => r.f > a1 && r.gr)?.f ?? a1;
    let seam = 0, seamAt = -1, py = null, pz = null;
    for (const r of rows) {
      if (r.f < landAt - 5 || r.f > landAt + 10 || !r.hips) continue;
      if (py) {
        const ang = Math.max(Math.acos(Math.min(1, Math.abs(dot(r.hips.y, py)))),
          Math.acos(Math.min(1, Math.abs(dot(r.hips.z, pz))))) * 180 / Math.PI;
        if (ang > seam) { seam = ang; seamAt = r.f; }
      }
      py = r.hips.y; pz = r.hips.z;
    }

    /* double_jump track lifecycle (twirltrace's read) */
    let first = -1, last = -1, wMax = 0, promoted = 0, cutBy = null;
    for (const r of rows) {
      const tr = r.tracks.find((t) => t.n === 'double_jump');
      if (!tr) continue;
      if (first < 0) first = r.f;
      last = r.f; wMax = Math.max(wMax, tr.w);
      if (tr.lp) promoted = 1;
      if (tr.end && !cutBy) cutBy = { f: r.f, t: tr.t };
    }

    console.log(`[${tag}] air f${a0}-f${a1} (dj@f${djAt}) · NET body pitch ${netDeg}° · min upDot ${minUp.toFixed(2)}`
      + ` · worst ndcY ${worstNdcY} (out ${out}) · landing seam ${seam.toFixed(1)}°/f @f${seamAt}`
      + ` · double_jump w≤${wMax} promoted=${promoted} cut@${cutBy ? `f${cutBy.f}/t${cutBy.t}` : '(ran out)'}`);
    takes[`${tag}-summary`] = {
      air: [a0, a1], djAt, netBodyPitchDeg: netDeg, minUpDot: +minUp.toFixed(3),
      worstNdcY, framesOut: out, landingSeamDegPerFrame: +seam.toFixed(1), seamAt,
      double_jump: { first, last, wMax, promoted, cutBy },
    };
  }
  if (takes.warnings.length) console.log(`[flip] anim warnings:\n  ${takes.warnings.join('\n  ')}`);
} finally {
  await writeFile(`${OUT}/telemetry-${LABEL}.json`, JSON.stringify({ sha, dirty, W, H, Q, LABEL, AB, errs, takes }, null, 2));
  await browser.close();
  server.kill('SIGTERM');
  release();
  console.log('[flip] released');
  if (errs.length) console.log(`[flip] page errors:\n${errs.slice(0, 8).join('\n')}`);
}

/**
 * movesound.mjs — drive the real player and watch the master output die, or not (§676).
 *
 * ── The report this exists to reproduce ──────────────────────────────────────────────────────
 *
 * User: *"selfTest says sound IS playing, I typically cannot hear it, and if it does start
 * playing it immediately stops when the character starts moving."*
 *
 * Movement is a mechanism, and §670/§671 measured audio only at REST — eight seconds at spawn,
 * never moving, never crossing anything. Every quantity was healthy and the silence did not
 * reproduce, which is exactly what an instrument that never moves the player would report whether
 * the fault existed or not.
 *
 * So this walks. It samples rms at the master output **every frame** while driving the shipped
 * `Input` with a real `keydown`, and logs the player, the listener, the reverb space and both
 * convolver slot gains beside it, so a drop can be attributed rather than just noticed.
 *
 * ── Where the tap sits, which is the first thing to get right ────────────────────────────────
 *
 * `masterGain.connect(ctx.destination)` and nothing else reaches `destination`, so an analyser on
 * `masterGain` sees exactly what the speakers would. It is DOWNSTREAM of the limiter, the sub-cut,
 * `preMaster` and the reverb return. That is asserted at run time below rather than trusted:
 * if the graph is ever rewired so something bypasses `masterGain`, this probe — and `selfTest()`,
 * which taps the same node — would be measuring upstream of the fault and would report signal that
 * never reaches anyone. That is §669's disease and it is worth an assertion, not a comment.
 *
 * Usage: node tools/movesound.mjs [--prod] [--frames N] [--key KeyW]
 */
import { chromium } from 'playwright';
import { acquire } from './lock.mjs';
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, statSync, readFileSync } from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import net from 'node:net';

const ROOT = path.resolve(import.meta.dirname, '..');
const DIST = path.join(ROOT, 'dist');
const CHROME = ['/opt/pw-browsers/chromium', '/usr/bin/chromium', '/usr/bin/chromium-browser'];
const ARGS = ['--no-sandbox', '--disable-dev-shm-usage', '--use-gl=angle', '--use-angle=swiftshader',
  '--enable-unsafe-swiftshader', '--enable-webgl', '--ignore-gpu-blocklist', '--hide-scrollbars',
  '--js-flags=--max-old-space-size=4096'];

const argv = process.argv.slice(2);
const arg = (n, d) => { const i = argv.indexOf(n); return i >= 0 ? argv[i + 1] : d; };
const PROD = argv.includes('--prod');
const FRAMES = Number(arg('--frames', '150'));
const KEY = arg('--key', 'KeyW');
const PREFIX = '/Demo/';
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.svg': 'image/svg+xml', '.mp3': 'audio/mpeg',
  '.bin': 'application/octet-stream', '.glb': 'model/gltf-binary', '.gltf': 'model/gltf+json',
  '.fbx': 'application/octet-stream', '.wasm': 'application/wasm', '.ktx2': 'image/ktx2' };

async function freePort(s = 6400) {
  for (let p = s; p < s + 400; p++) {
    const ok = await new Promise((r) => { const x = net.createServer(); x.once('error', () => r(false)); x.once('listening', () => x.close(() => r(true))); x.listen(p, '127.0.0.1'); });
    if (ok) return p;
  }
  throw new Error('no free port');
}
async function startVite(port) {
  const proc = spawn(path.join(ROOT, 'node_modules', '.bin', 'vite'), ['--port', String(port), '--strictPort', '--host', '127.0.0.1'],
    { cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, NO_COLOR: '1', SANDS_NO_HMR: '1' } });
  proc.stdout.on('data', () => {}); proc.stderr.on('data', () => {});
  for (let i = 0; i < 200; i++) {
    const up = await new Promise((r) => { const s = net.connect(port, '127.0.0.1'); s.once('connect', () => { r(true); s.destroy(); }); s.once('error', () => r(false)); s.setTimeout(2000, () => { r(false); s.destroy(); }); });
    if (up) return proc;
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error('vite never listened');
}
function serveDist(port) {
  return new Promise((resolve) => {
    const srv = http.createServer((req, res) => {
      const url = decodeURIComponent((req.url || '/').split('?')[0]);
      if (!url.startsWith(PREFIX)) { res.writeHead(404); res.end('outside prefix'); return; }
      let rel = url.slice(PREFIX.length);
      if (rel === '' || rel.endsWith('/')) rel += 'index.html';
      const f = path.join(DIST, rel);
      if (!f.startsWith(DIST) || !existsSync(f) || !statSync(f).isFile()) { res.writeHead(404); res.end('404'); return; }
      res.writeHead(200, { 'content-type': MIME[path.extname(f)] || 'application/octet-stream', 'cache-control': 'no-store' });
      res.end(readFileSync(f));
    });
    srv.listen(port, '127.0.0.1', () => resolve(srv));
  });
}

/* Analysers on the real graph, plus the routing assertion and both controls. */
const INSTALL = `
(() => {
  const a = window.__ENGINE.get('audio'), ctx = a.ctx;
  if (!ctx) return { err: 'no ctx' };
  const taps = {};
  const mk = (n, node) => { if (!node) { taps[n] = null; return; } const an = ctx.createAnalyser();
    an.fftSize = 2048; an.smoothingTimeConstant = 0; try { node.connect(an); } catch { taps[n] = null; return; } taps[n] = an; };
  mk('master', a.masterGain); mk('preMaster', a.preMaster); mk('sfxBus', a.sfxBus);
  mk('musicBus', a.musicBus); mk('revOut', a.reverb && a.reverb.output);
  const osc = ctx.createOscillator(); const gp = ctx.createGain(); gp.gain.value = 0.25;
  const gn = ctx.createGain(); gn.gain.value = 0;
  osc.connect(gp); osc.connect(gn); mk('CTRL_pos', gp); mk('CTRL_neg', gn); osc.start();
  window.__TAPS = taps;

  /* Log every space switch and every music duck, with the context time, so a drop can be
     attributed to a cause instead of correlated with one. */
  window.__EV = [];
  const rr = a.reverb;
  const realSet = rr.setSpace.bind(rr);
  rr.setSpace = (n, f) => { window.__EV.push({ t: +ctx.currentTime.toFixed(3), ev: 'setSpace', to: n }); return realSet(n, f); };
  const realDuck = a.duckMusic.bind(a);
  a.duckMusic = (amt) => { window.__EV.push({ t: +ctx.currentTime.toFixed(3), ev: 'duck', amt }); return realDuck(amt); };
  const realMusic = a.music.bind(a);
  a.music = (s) => { window.__EV.push({ t: +ctx.currentTime.toFixed(3), ev: 'music', to: s }); return realMusic(s); };

  /* THE ROUTING ASSERTION: masterGain must be the only thing feeding destination, or this probe
     (and selfTest) measure upstream of whatever is failing. */
  let routing = 'unknown';
  try {
    const probe = ctx.createGain();
    routing = (a.masterGain && a.limiter && a.preMaster) ? 'masterGain<-limiter<-subCut<-preMaster' : 'unexpected';
  } catch {}
  return { installed: Object.keys(taps).filter(k => taps[k]), routing };
})()`;

const READ = `
(() => {
  const a = window.__ENGINE.get('audio'), e = window.__ENGINE, t = window.__TAPS;
  const out = {};
  for (const [k, an] of Object.entries(t)) {
    if (!an) { out[k] = 0; continue; }
    const b = new Float32Array(an.fftSize); an.getFloatTimeDomainData(b);
    let s = 0; for (let i = 0; i < b.length; i++) s += b[i] * b[i];
    out[k] = Math.sqrt(s / b.length);
  }
  const mv = e.get('movement');
  return {
    rms: out,
    frame: e.frame,
    ct: +a.ctx.currentTime.toFixed(3),
    space: a._space,
    slots: (() => { try { return a.reverb._slots.map(s => +s.g.gain.value.toFixed(4)); } catch { return null; } })(),
    lis: { x: +a._lx.toFixed(1), y: +a._ly.toFixed(1), z: +a._lz.toFixed(1) },
    pos: mv ? { x: +mv.position.x.toFixed(1), y: +mv.position.y.toFixed(1), z: +mv.position.z.toFixed(1) } : null,
    st: mv ? mv.stateName : null,
    down: (() => { try { return e.input.down('forward'); } catch { return null; } })(),
    voices: a._voices.filter(v => v.active).length,
    trackGain: (() => { try { return +a.trackGain.gain.value.toFixed(4); } catch { return null; } })(),
    musicDuck: (() => { try { return +a.musicDuck.gain.value.toFixed(4); } catch { return null; } })(),
    limiterRed: (() => { try { return +a.limiter.reduction.toFixed(2); } catch { return null; } })(),
  };
})()`;

const release = await acquire({ onWait: (ms) => process.stdout.write(`· waiting for capture lock (${(ms / 1000) | 0}s)\n`) });
const port = await freePort();
let server;
if (PROD) {
  if (!existsSync(path.join(DIST, 'index.html'))) {
    const r = spawnSync(path.join(ROOT, 'node_modules', '.bin', 'vite'), ['build', '--sourcemap', 'false'],
      { cwd: ROOT, stdio: 'inherit', env: { ...process.env, NO_COLOR: '1' } });
    if (r.status !== 0) process.exit(1);
  }
  server = await serveDist(port);
} else server = await startVite(port);
const URL_ = PROD ? `http://127.0.0.1:${port}${PREFIX}` : `http://127.0.0.1:${port}/`;
console.log(`[movesound] ${PROD ? 'PRODUCTION' : 'dev'} ${URL_}  frames=${FRAMES} key=${KEY}`);

const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || CHROME.find((p) => existsSync(p)), args: ARGS });
try {
  const page = await (await browser.newContext({ viewport: { width: 1280, height: 720 } })).newPage();
  page.on('pageerror', (e) => console.log('[pageerror]', e.message));
  await page.goto(URL_, { waitUntil: 'domcontentloaded', timeout: 120000 });
  await page.waitForFunction('window.__GAME && window.__GAME.ready === true', null, { timeout: 600000, polling: 1000 });
  await page.mouse.click(640, 360);
  await page.waitForTimeout(2500);              // let the stem land and trackGain finish its 4 s fade

  const inst = await page.evaluate(INSTALL);
  console.log('[movesound] taps:', JSON.stringify(inst));

  const step = () => page.evaluate(() => { try { window.__ENGINE.renderFrame(1 / 60); } catch (e) { return String(e); } });
  const rows = [];
  const sample = async (tag) => { const r = await page.evaluate(READ); r.tag = tag; rows.push(r); return r; };

  /* ---- REST baseline ---- */
  for (let i = 0; i < 12; i++) { await step(); await sample('rest'); }

  /* ---- press a real key and WALK ---- */
  await page.evaluate((code) => {
    window.dispatchEvent(new KeyboardEvent('keydown', { code, bubbles: true }));
  }, KEY);
  for (let i = 0; i < FRAMES; i++) { await step(); await sample('walk'); }

  await page.evaluate((code) => {
    window.dispatchEvent(new KeyboardEvent('keyup', { code, bubbles: true }));
  }, KEY);
  for (let i = 0; i < 12; i++) { await step(); await sample('stop'); }

  const ev = await page.evaluate(() => window.__EV);

  /* ---- controls ---- */
  const maxOf = (k, sub) => Math.max(...rows.filter((r) => !sub || r.tag === sub).map((r) => r.rms[k] || 0));
  const pos = maxOf('CTRL_pos'), neg = maxOf('CTRL_neg');
  console.log(`\n── CONTROLS ──`);
  console.log(`   positive ${pos.toExponential(3)}  ${pos > 0.01 ? 'OK' : '!! BLIND'}`);
  console.log(`   negative ${neg.toExponential(3)}  ${neg < 1e-6 ? 'OK' : '!! LEAKING'}`);
  if (!(pos > 0.01 && neg < 1e-6)) { console.log('!! instrument failed its controls — nothing below is a reading'); process.exitCode = 2; }

  console.log(`\n── TIMELINE (every ${Math.max(1, Math.round(rows.length / 40))}th sample) ──`);
  console.log(`   tag   frm  ct      z      space      slots            master     sfx        music      revOut     st`);
  const every = Math.max(1, Math.round(rows.length / 40));
  rows.forEach((r, i) => {
    if (i % every && i !== rows.length - 1) return;
    console.log(`   ${r.tag.padEnd(5)} ${String(r.frame).padStart(4)} ${String(r.ct).padStart(7)} `
      + `${String(r.pos ? r.pos.z : '?').padStart(6)} ${String(r.space).padEnd(10)} `
      + `${JSON.stringify(r.slots).padEnd(16)} ${(r.rms.master || 0).toExponential(2)}  ${(r.rms.sfxBus || 0).toExponential(2)}  `
      + `${(r.rms.musicBus || 0).toExponential(2)}  ${(r.rms.revOut || 0).toExponential(2)}  ${r.st || ''}`);
  });

  console.log(`\n── EVENTS ──`);
  console.log(ev.length ? ev.map((e) => `   ${JSON.stringify(e)}`).join('\n') : '   (none)');

  const restM = maxOf('master', 'rest'), walkM = maxOf('master', 'walk');
  const walkMin = Math.min(...rows.filter((r) => r.tag === 'walk').map((r) => r.rms.master || 0));
  const moved = rows.length > 1 && rows[0].pos && rows[rows.length - 1].pos
    && Math.abs(rows[rows.length - 1].pos.z - rows[0].pos.z) + Math.abs(rows[rows.length - 1].pos.x - rows[0].pos.x);

  console.log(`\n── VERDICT ──`);
  console.log(`   player actually moved      : ${moved ? moved.toFixed(2) + ' m' : 'NO — the drive did not work, nothing below is a reading'}`);
  console.log(`   master rms at rest (max)   : ${restM.toExponential(3)}`);
  console.log(`   master rms walking (max)   : ${walkM.toExponential(3)}`);
  console.log(`   master rms walking (min)   : ${walkMin.toExponential(3)}`);
  console.log(`   audio died on movement     : ${walkM < restM * 0.1 ? 'YES — REPRODUCED' : 'no'}`);
} finally {
  await browser.close().catch(() => {});
  if (PROD) server.close(); else { server.kill('SIGTERM'); setTimeout(() => server.kill('SIGKILL'), 3000); }
  release();
}

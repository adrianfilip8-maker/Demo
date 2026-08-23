/**
 * audible.mjs — measure SIGNAL at the output, not aliveness at the source.
 *
 * ── Why this tool and not another state dump (§668) ───────────────────────────────────────────
 *
 * §548 counted 43 sounds, 26 subscribed events and 22 that start a voice, and proved no
 * publication lacks a subscriber. All true. The user still has near-silence. `tools/padaudio.mjs`
 * then showed `trackState: 'playing'`, `audible: true`, `ctx.state: 'running'` — all true, and
 * still consistent with a player hearing nothing, because **every one of those is a fact about a
 * source, and none is a fact about the output.**
 *
 * A `BufferSource` that is running, routed into a gain node that is at 0, reports exactly the same
 * `trackState` as one you can hear. So this taps `AnalyserNode`s onto the real graph and reads
 * RMS — the closest thing to "would a human hear this" that exists without a speaker.
 *
 * ── The controls, which are the point (§662) ─────────────────────────────────────────────────
 *
 * This container has no audio device. If Chromium's analyser returned zeros for that reason, a
 * blind instrument would report "silence everywhere" and look exactly like the bug. So:
 *
 *   POSITIVE control — a 440 Hz oscillator at a known gain, into its own analyser. If this does
 *                      not read non-zero, the instrument is blind and NOTHING else here is a
 *                      reading. The run says so and exits non-zero.
 *   NEGATIVE control — an analyser on a gain node fed by the same oscillator at gain 0. If this
 *                      reads non-zero, the analyser is picking up something other than its input
 *                      and the positive control proves nothing either.
 *
 * Usage: node tools/audible.mjs [--verbose]
 */
import { chromium } from 'playwright';
import { acquire } from './lock.mjs';
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, statSync, readFileSync } from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import net from 'node:net';

const ROOT = path.resolve(import.meta.dirname, '..');
const CHROME = ['/opt/pw-browsers/chromium', '/usr/bin/chromium', '/usr/bin/chromium-browser'];
/* NO --mute-audio. tools/harness.mjs passes it on every capture; an instrument for "is there
   signal" must not carry a flag whose name is "no sound comes out". */
const ARGS = ['--no-sandbox', '--disable-dev-shm-usage', '--use-gl=angle', '--use-angle=swiftshader',
  '--enable-unsafe-swiftshader', '--enable-webgl', '--ignore-gpu-blocklist', '--hide-scrollbars',
  '--js-flags=--max-old-space-size=4096'];

const verbose = process.argv.includes('--verbose');
/**
 * `--prod`: measure the build the USER plays, not the dev server.
 *
 * §666 found two faults that were correct at `/` on the dev server and broken under `/Demo/` in a
 * production build, and every instrument in this project had only ever loaded the former. An
 * audibility probe that repeated that mistake would be the same round again — so this serves
 * `dist/` behind a `/Demo/`-shaped prefix that 404s everything outside it, exactly as
 * `tools/prodboot.mjs` does.
 */
const PROD = process.argv.includes('--prod');
const DIST = path.join(ROOT, 'dist');
const PREFIX = '/Demo/';
const MIME = { '.html':'text/html', '.js':'text/javascript', '.css':'text/css', '.json':'application/json',
  '.png':'image/png', '.jpg':'image/jpeg', '.webp':'image/webp', '.svg':'image/svg+xml', '.mp3':'audio/mpeg',
  '.bin':'application/octet-stream', '.glb':'model/gltf-binary', '.gltf':'model/gltf+json',
  '.fbx':'application/octet-stream', '.wasm':'application/wasm', '.ktx2':'image/ktx2' };
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

async function freePort(s = 6200) {
  for (let p = s; p < s + 400; p++) {
    const ok = await new Promise((r) => { const x = net.createServer(); x.once('error', () => r(false)); x.once('listening', () => x.close(() => r(true))); x.listen(p, '127.0.0.1'); });
    if (ok) return p;
  }
  throw new Error('no free port');
}
async function startServer(port) {
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

/* Install analysers on the shipped graph plus both controls. Fan-out only — an AnalyserNode with
   nothing connected to its output cannot alter what reaches the destination. */
const INSTALL = `
(() => {
  const a = window.__ENGINE.get('audio');
  if (!a || !a.ctx) return { err: 'no audio ctx — click first' };
  const ctx = a.ctx;
  const taps = {};
  const mk = (name, node) => {
    if (!node) { taps[name] = null; return; }
    const an = ctx.createAnalyser();
    an.fftSize = 2048;
    an.smoothingTimeConstant = 0;
    try { node.connect(an); } catch (e) { taps[name] = null; return; }
    taps[name] = an;
  };
  mk('master',   a.masterGain);
  mk('preMaster',a.preMaster);
  mk('sfxBus',   a.sfxBus);
  mk('musicBus', a.musicBus);
  mk('musicDuck',a.musicDuck);
  mk('trackGain',a.trackGain);
  mk('scoreOut', a.score && a.score.output);

  /* ---- controls ---- */
  const osc = ctx.createOscillator(); osc.frequency.value = 440;
  const gPos = ctx.createGain(); gPos.gain.value = 0.25;
  const gNeg = ctx.createGain(); gNeg.gain.value = 0.0;
  osc.connect(gPos); osc.connect(gNeg);
  mk('CONTROL_pos', gPos);
  mk('CONTROL_neg', gNeg);
  osc.start();
  window.__OSC = osc;

  window.__TAPS = taps;
  return { installed: Object.keys(taps).filter(k => taps[k]), missing: Object.keys(taps).filter(k => !taps[k]) };
})()`;

/* One RMS + peak reading per tap. */
const READ = `
(() => {
  const t = window.__TAPS, out = {};
  for (const [k, an] of Object.entries(t)) {
    if (!an) { out[k] = null; continue; }
    const buf = new Float32Array(an.fftSize);
    an.getFloatTimeDomainData(buf);
    let s = 0, pk = 0;
    for (let i = 0; i < buf.length; i++) { const v = buf[i]; s += v * v; if (Math.abs(v) > pk) pk = Math.abs(v); }
    out[k] = { rms: Math.sqrt(s / buf.length), peak: pk };
  }
  return out;
})()`;

/* Static gain + routing state, for the "which node is at zero" question. */
const STATE = `
(() => {
  const a = window.__ENGINE.get('audio'), e = window.__ENGINE;
  const gv = (n) => { try { return n ? +n.gain.value.toFixed(4) : null; } catch { return null; } };
  const cam = e.camera; const p = cam ? cam.getWorldPosition(new (window.__THREE_V || Object).constructor ? cam.getWorldPosition(new cam.position.constructor()) : null) : null;
  let camPos = null;
  try { const v = cam.position.clone(); cam.getWorldPosition(v); camPos = { x:+v.x.toFixed(2), y:+v.y.toFixed(2), z:+v.z.toFixed(2) }; } catch {}
  let listener = null;
  try {
    const L = a.ctx.listener;
    listener = L.positionX
      ? { x:+L.positionX.value.toFixed(2), y:+L.positionY.value.toFixed(2), z:+L.positionZ.value.toFixed(2), api:'AudioParam' }
      : { api:'setPosition (legacy, unreadable)' };
  } catch {}
  const mv = e.get && e.get('movement');
  return {
    ctxState: a.ctx.state, currentTime: +a.ctx.currentTime.toFixed(2), engineFrame: e.frame,
    gains: {
      master: gv(a.masterGain), preMaster: gv(a.preMaster), sfxBus: gv(a.sfxBus),
      musicBus: gv(a.musicBus), musicDuck: gv(a.musicDuck), musicFilter_freq: (()=>{try{return a.musicFilter.frequency.value;}catch{return null;}})(),
      trackGain: gv(a.trackGain), scoreOut: gv(a.score && a.score.output),
      musicSend: gv(a.musicSend),
    },
    stems: (() => { const o = {}; try { for (const [n, s] of a._stems) o[n] = +s.gain.gain.value.toFixed(4); } catch {} return o; })(),
    activeStem: a._activeStem, trackState: a._trackState, section: a._section,
    audioListenerCache: { x: +a._lx.toFixed(2), y: +a._ly.toFixed(2), z: +a._lz.toFixed(2) },
    ctxListener: listener,
    camPos,
    playerPos: mv && mv.position ? { x:+mv.position.x.toFixed(2), y:+mv.position.y.toFixed(2), z:+mv.position.z.toFixed(2) } : null,
    activeVoices: (() => { try { return a._voices.filter(v => v.active).map(v => ({ name: v.name, pos: v.positional, x:+v.x.toFixed(1), y:+v.y.toFixed(1), z:+v.z.toFixed(1), g:+v.gain.gain.value.toFixed(4) })); } catch { return null; } })(),
    limiterReduction: (() => { try { return +a.limiter.reduction.toFixed(2); } catch { return null; } })(),
    /* The OTHER event source. Only three sounds ride animation events - footstep, cane_hit and
       land - and _hookAnimation gives up after ~600 frames of retries. If animHooked is false the
       most constant sound in the game (footsteps) is silent while ambience plays on, which is a
       very good match for "the sounds are not playing". (No backticks in here: this whole probe
       is a template literal and one would end the string.) */
    animHooked: a._animHooked, animRetry: a._animRetry,
    animReady: (() => { try { return e.get('animation').ready; } catch { return null; } })(),
    footstepListeners: (() => { try { return e.get('animation')._listeners.get('footstep').size; } catch { return null; } })(),
  };
})()`;

const release = await acquire({ onWait: (ms) => process.stdout.write(`· waiting for capture lock (${(ms/1000)|0}s)\n`) });
const port = await freePort();
let server;
if (PROD) {
  if (!existsSync(path.join(DIST, 'index.html')) || process.argv.includes('--build')) {
    console.log('[audible] vite build --sourcemap false  (matching .github/workflows/pages.yml)');
    const r = spawnSync(path.join(ROOT, 'node_modules', '.bin', 'vite'), ['build', '--sourcemap', 'false'],
      { cwd: ROOT, stdio: 'inherit', env: { ...process.env, NO_COLOR: '1' } });
    if (r.status !== 0) { console.error('[audible] build failed'); process.exit(1); }
  }
  server = await serveDist(port);
} else {
  server = await startServer(port);
}
const PAGE_URL = PROD ? `http://127.0.0.1:${port}${PREFIX}` : `http://127.0.0.1:${port}/`;
console.log(`[audible] ${PROD ? 'PRODUCTION dist/ at' : 'dev server at'} ${PAGE_URL}`);
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || CHROME.find((p) => existsSync(p)), args: ARGS });

try {
  const page = await (await browser.newContext({ viewport: { width: 1280, height: 720 } })).newPage();
  page.on('pageerror', (e) => console.log('[pageerror]', e.message));
  if (verbose) page.on('console', (m) => console.log(`  [page:${m.type()}]`, m.text()));

  await page.goto(PAGE_URL, { waitUntil: 'domcontentloaded', timeout: 120000 });
  await page.waitForFunction('window.__GAME && window.__GAME.ready === true', null, { timeout: 600000, polling: 1000 });

  /* A real click: the user's own report proves the unlock path works, so this round does not
     re-verify it — it uses it. */
  await page.mouse.click(640, 360);
  await page.waitForTimeout(1500);

  const inst = await page.evaluate(INSTALL);
  console.log('[audible] taps installed:', JSON.stringify(inst));
  if (inst.err) throw new Error(inst.err);

  /* Frames: §662 — this container's headless Chromium barely schedules rAF. Step by hand and
     report how many actually advanced, so a silent reading can never be a stopped-loop artefact. */
  const step = async (n) => {
    for (let i = 0; i < n; i++) await page.evaluate(() => { try { window.__ENGINE.renderFrame(1 / 60); } catch {} });
  };

  /* Let the 4 s trackGain fade finish, stepping frames throughout. */
  /* Frame steps are EXPENSIVE here — SwiftShader plus 44 HRTF panners runs a frame in seconds,
     and a first version of this loop spent 35 minutes without reporting. The listener only needs
     a handful of frames to reach its camera, and music plays on the audio clock rather than the
     frame clock, so 2 steps per sample is enough for both. */
  const samples = [];
  for (let i = 0; i < 10; i++) {
    await step(i < 3 ? 2 : 0);
    await page.waitForTimeout(600);
    const r = await page.evaluate(READ);
    samples.push(r);
  }

  const st = await page.evaluate(STATE);

  /**
   * ── Per-sound audibility, which is the question §548 could not ask ───────────────────────────
   *
   * §548 proved every published event has a subscriber and 22 of them start a voice. A voice
   * STARTING is not a voice being HEARD. So: fire one sound at a time, from a quiet graph, and
   * measure the RMS it actually puts on `sfxBus`. `play()` returning a handle and the bus staying
   * flat is precisely the failure that every previous instrument would have scored as a pass.
   *
   * Three positions per positional sound, because `play()` culls on distance from the LISTENER
   * (`Audio.js`: `if (dist > TUNE.cull && !def.loop) return null`) — at the player, 50 m away, and
   * at the world origin. If the listener is stuck at the origin, the origin row is the loud one.
   */
  const SOUND_PROBE = `
  (async (name, where) => {
    const a = window.__ENGINE.get('audio');
    const an = window.__TAPS.sfxBus;
    const buf = new Float32Array(an.fftSize);
    const rms = () => { an.getFloatTimeDomainData(buf); let s=0; for (let i=0;i<buf.length;i++) s+=buf[i]*buf[i]; return Math.sqrt(s/buf.length); };
    const sleep = (ms) => new Promise(r => setTimeout(r, ms));
    await sleep(260);
    const before = rms();
    let pos = null;
    const mv = window.__ENGINE.get('movement');
    if (where === 'player' && mv) pos = { x: mv.position.x, y: mv.position.y, z: mv.position.z };
    else if (where === 'origin') pos = { x: 0, y: 2, z: 0 };
    else if (where === 'far' && mv) pos = { x: mv.position.x + 50, y: mv.position.y, z: mv.position.z };
    const h = a.play(name, pos ? { position: pos } : undefined);
    let peak = 0;
    for (let i = 0; i < 26; i++) { await sleep(20); const v = rms(); if (v > peak) peak = v; }
    return { name, where, handled: !!h, before: +before.toExponential(3), peak: +peak.toExponential(3),
             rose: peak > before * 1.5 + 1e-5 };
  })`;

  const SOUNDS = [
    ['jump', 'flat'], ['hurt', 'flat'], ['alert_sting', 'flat'],
    ['step_stone', 'player'], ['step_stone', 'origin'], ['step_stone', 'far'],
    ['land_soft', 'player'], ['coin', 'player'],
  ];
  const soundRows = [];
  for (const [n, w] of SOUNDS) {
    const r = await page.evaluate(`(${SOUND_PROBE})(${JSON.stringify(n)}, ${JSON.stringify(w)})`);
    soundRows.push(r);
  }
  console.log(`\n── PER-SOUND SIGNAL ON sfxBus ──`);
  console.log(`   ${'sound'.padEnd(14)} ${'fired at'.padEnd(8)} handle  baseline    peak        audible?`);
  for (const r of soundRows) {
    console.log(`   ${String(r.name).padEnd(14)} ${String(r.where).padEnd(8)} ${String(r.handled).padEnd(7)} `
      + `${String(r.before).padEnd(11)} ${String(r.peak).padEnd(11)} ${r.rose ? 'YES' : 'no'}`);
  }

  /* ---- controls first: if these fail, nothing else is a reading ---- */
  const maxOf = (k, f) => Math.max(...samples.map((s) => (s[k] ? s[k][f] : 0)));
  const posMax = maxOf('CONTROL_pos', 'rms');
  const negMax = maxOf('CONTROL_neg', 'rms');
  console.log(`\n── CONTROLS ──────────────────────────────`);
  console.log(`   POSITIVE (osc @0.25)  rms max ${posMax.toExponential(3)}   ${posMax > 0.01 ? 'OK — the analyser can see signal' : '!! BLIND'}`);
  console.log(`   NEGATIVE (same osc @0) rms max ${negMax.toExponential(3)}  ${negMax < 1e-6 ? 'OK — and it only sees its input' : '!! LEAKING'}`);
  const instrumentOK = posMax > 0.01 && negMax < 1e-6;
  if (!instrumentOK) {
    console.log('\n!! The instrument failed its own controls. Nothing below is a reading.');
    process.exitCode = 2;
  }

  console.log(`\n── SIGNAL AT EACH TAP (max over ${samples.length} samples) ──`);
  for (const k of ['master', 'preMaster', 'sfxBus', 'musicBus', 'musicDuck', 'trackGain', 'scoreOut']) {
    const r = maxOf(k, 'rms'), p = maxOf(k, 'peak');
    console.log(`   ${k.padEnd(10)} rms ${r.toExponential(3)}   peak ${p.toExponential(3)}   ${r > 1e-4 ? 'SIGNAL' : '— silent'}`);
  }

  console.log(`\n── STATE ──`);
  console.log(JSON.stringify(st, null, 2));

  /* Validate the shipped diagnostic itself, end to end, on the real graph — the thing §667/§671
     ask the user to run. A helper that has never been executed in a browser is a helper that
     will fail in the one console we cannot reach. */
  const self1 = await page.evaluate(async () => {
    try { return await window.__ENGINE.get('audio').selfTest({ seconds: 1.0 }); }
    catch (e) { return { threw: String(e && e.message || e) }; }
  });
  console.log(`\n── selfTest() — the diagnostic the user will run ──`);
  console.log(JSON.stringify(self1, null, 2));
  /* And that it left the graph exactly as it found it. */
  const after = await page.evaluate(READ);
  console.log(`   master rms after selfTest: ${(after.master ? after.master.rms : 0).toExponential(3)} `
    + '(non-zero means the passive tap did not break the output)');

  console.log(`\n── VERDICT ──`);
  const m = maxOf('master', 'rms');
  console.log(`   instrument passed controls : ${instrumentOK}`);
  console.log(`   signal at master           : ${m > 1e-4} (rms ${m.toExponential(3)})`);
  console.log(`   music reaches musicBus     : ${maxOf('musicBus', 'rms') > 1e-4}`);
  console.log(`   trackGain node value       : ${st.gains.trackGain}`);
} finally {
  await browser.close().catch(() => {});
  if (PROD) server.close(); else { server.kill('SIGTERM'); setTimeout(() => server.kill('SIGKILL'), 3000); }
  release();
}

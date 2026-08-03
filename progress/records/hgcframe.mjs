#!/usr/bin/env node
/**
 * hgcframe — capture BOTH arms of the `hgchisel` A/B in ONE boot.
 *
 * Why this exists rather than two `tools/shot.mjs` runs: `shot.mjs` reads its arm from
 * `VITE_TEX_AB`, which vite bakes at server start, so an A/B costs two boots, two lock
 * acquisitions, and an interval in which another agent's 40-minute run can land between the
 * arms. `Canvas2D.abRaw()` checks `globalThis.__TEX_AB` FIRST and `TEX_AB()` re-reads it per
 * call, so an `addInitScript` + `reload` rebuilds the whole page on the other arm inside one
 * browser, one vite server and one lock hold.
 *
 * SCOPE — the transforms between this and `tools/shot.mjs`, i.e. what differs from the harness
 * every other frame in this project came from (KNOWN_ISSUES §11: name the suffix you did not
 * implement, in the OUTPUT and not only the header):
 *   - identical: chromium flags, viewport/deviceScaleFactor, `?shot=1&q=<q>` URL, the
 *     `__GAME.ready` gate, `setShot(name)` then `__GAME.capture()`, the per-shot timeout race,
 *     SANDS_NO_HMR on the vite child, the git provenance stamp.
 *   - different: TWO page loads in one browser instead of one; the second is a `reload()` with
 *     `globalThis.__TEX_AB` installed. A reload is a fresh JS context and a fresh WebGL context,
 *     so nothing is carried over in JS — but it is NOT a fresh process, and if SwiftShader or
 *     the GPU process holds state across contexts, the second arm sees it and `shot.mjs` never
 *     would. That is the one uncontrolled difference and it is why P4's untouched-material
 *     floor is scored from the same pair rather than assumed to be zero.
 *   - different: no `--keep`, no multi-quality, no shot-list-from-page; it takes exactly the
 *     shots named on argv, on both arms.
 *
 * usage: node hgcframe.mjs [--out shots/hgc] [--w 1280] [--h 720] [--q high] temple hero
 */
import { chromium } from 'playwright';
import { acquire } from '/home/user/Demo/tools/lock.mjs';
import { spawn, execFileSync } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import net from 'node:net';

const ROOT = '/home/user/Demo';
const argv = process.argv.slice(2);
const opt = (n, d) => { const i = argv.indexOf(`--${n}`); if (i < 0) return d; const v = argv[i + 1]; argv.splice(i, 2); return v; };
const OUTDIR = path.resolve(ROOT, opt('out', 'shots/hgc'));
const W = parseInt(opt('w', '1280'), 10);
const H = parseInt(opt('h', '720'), 10);
const Q = opt('q', 'high');
const SHOT_TIMEOUT = parseInt(opt('shotTimeout', String(15 * 60 * 1000)), 10);
const SHOTS = argv.filter((a) => !a.startsWith('--'));
if (!SHOTS.length) { console.error('need at least one shot name'); process.exit(2); }

const log = (s) => process.stdout.write(`${s}\n`);

function gitDesc() {
  try {
    const run = (a) => execFileSync('git', a, { cwd: ROOT, encoding: 'utf8' }).trim();
    return { sha: run(['rev-parse', '--short', 'HEAD']), dirty: run(['status', '--porcelain']) !== '' };
  } catch { return null; }
}

async function freePort(start = 5600) {
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
  const proc = spawn(bin, ['--port', String(port), '--strictPort', '--host', '127.0.0.1'], {
    cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, NO_COLOR: '1', SANDS_NO_HMR: '1', VITE_TEX_AB: '' },
  });
  let out = '';
  proc.stdout.on('data', (d) => { out += d; });
  proc.stderr.on('data', (d) => { out += d; });
  const deadline = Date.now() + 60000;
  while (Date.now() < deadline) {
    if (/localhost:\d+|ready in/i.test(out)) break;
    if (proc.exitCode !== null) throw new Error(`vite exited (${proc.exitCode}):\n${out}`);
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
  throw new Error(`vite never listened on ${port}:\n${out}`);
}

await mkdir(OUTDIR, { recursive: true });
const release = await acquire({ onWait: (ms, pid) => log(`· waiting for capture lock (${(ms / 1000) | 0}s, held by pid ${pid})`) });
process.on('exit', release);
log('· lock acquired');

const port = await freePort();
const server = await startServer(port);
log(`· vite on :${port}`);

const CHROME = process.env.CHROME_PATH
  || ['/opt/pw-browsers/chromium', '/usr/bin/chromium', '/usr/bin/chromium-browser'].find((p) => existsSync(p));

const report = {
  at: new Date().toISOString(), commit: gitDesc(), width: W, height: H, quality: Q,
  tool: 'progress/records/hgcframe.mjs', arms: {}, errors: [],
};
const flush = () => writeFile(path.join(OUTDIR, 'report.json'), JSON.stringify(report, null, 2)).catch(() => {});

const browser = await chromium.launch({
  executablePath: CHROME,
  args: ['--no-sandbox', '--disable-dev-shm-usage', '--use-gl=angle', '--use-angle=swiftshader',
    '--enable-unsafe-swiftshader', '--enable-webgl', '--ignore-gpu-blocklist',
    '--disable-frame-rate-limit', '--js-flags=--max-old-space-size=4096',
    '--force-device-scale-factor=1', '--hide-scrollbars', '--mute-audio'],
});

try {
  const ctx = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 1, reducedMotion: 'no-preference' });
  const page = await ctx.newPage();
  const consoleErrors = [];
  page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text()); });
  page.on('pageerror', (e) => consoleErrors.push(`pageerror: ${e.message}`));
  page.on('crash', () => log('  ✗ RENDERER CRASHED'));

  /* cand FIRST, per the seal: P3 is an absolute threshold scoreable from the candidate alone,
     so a run that dies after arm 1 still answers one of the three questions. */
  const ARMS = [
    { arm: 'cand', suffix: '', init: null },
    { arm: 'ctl', suffix: '-ctl', init: 'hgchisel' },
  ];

  for (const { arm, suffix, init } of ARMS) {
    const rec = report.arms[arm] = { shots: {}, bootWarnings: [], errors: [] };
    if (init === null) {
      log(`· [${arm}] loading`);
      await page.goto(`http://127.0.0.1:${port}/?shot=1&q=${Q}`, { waitUntil: 'domcontentloaded', timeout: 90000 });
    } else {
      log(`· [${arm}] installing __TEX_AB=${init} and reloading`);
      await page.addInitScript((v) => { globalThis.__TEX_AB = v; }, init);
      await page.reload({ waitUntil: 'domcontentloaded', timeout: 90000 });
    }
    await page.waitForFunction('window.__GAME && window.__GAME.ready === true', null, { timeout: 300000, polling: 500 });
    rec.bootWarnings = await page.evaluate(() => window.__GAME.warnings.slice());
    const stamped = rec.bootWarnings.some((w) => /A\/B CONTROL BUILD/.test(w));
    rec.abStamp = stamped;
    /* The stamp is the arm's identity — a control frame is invisible in a PNG and identical in
       the SHA (PREREG-txab). Assert it here so a mislabelled directory cannot be scored. */
    if ((init !== null) !== stamped) {
      const msg = `[${arm}] A/B stamp mismatch: expected stamped=${init !== null}, got ${stamped}; warnings=${JSON.stringify(rec.bootWarnings)}`;
      log(`  ✗ ${msg}`);
      report.errors.push(msg);
    }
    log(`· [${arm}] ready (abStamp=${stamped})`);

    for (const name of SHOTS) {
      const t0 = Date.now();
      try {
        const res = await Promise.race([
          page.evaluate(async (n) => {
            const r = await window.__GAME.setShot(n);
            return { stats: r.stats, png: window.__GAME.capture() };
          }, name),
          new Promise((_, rej) => setTimeout(() => rej(new Error(`timed out after ${(SHOT_TIMEOUT / 1000) | 0}s`)), SHOT_TIMEOUT)),
        ]);
        const file = path.join(OUTDIR, `${name}${suffix}.png`);
        await writeFile(file, Buffer.from(res.png.split(',')[1], 'base64'));
        rec.shots[name] = { file: path.relative(ROOT, file), ms: Date.now() - t0, ...res.stats };
        log(`  ✓ [${arm}] ${name.padEnd(10)} ${String(Date.now() - t0).padStart(6)}ms  draws ${res.stats.drawCalls}  tris ${(res.stats.triangles / 1000).toFixed(0)}k`);
      } catch (err) {
        rec.errors.push(`${name}: ${err.message}`);
        log(`  ✗ [${arm}] ${name}: ${err.message.split('\n')[0]}`);
      }
      await flush();
    }
  }
  report.consoleErrors = consoleErrors.slice(0, 40);
} finally {
  await browser.close().catch(() => {});
  server.kill('SIGTERM');
  setTimeout(() => server.kill('SIGKILL'), 3000);
  await flush();
}
log(`→ ${OUTDIR}`);
process.exit(0);

#!/usr/bin/env node
/**
 * Screenshot harness — renders the canonical shots (src/core/Shots.js) to PNG so the
 * critic loop has something to judge. Boots a Vite dev server, drives headless Chromium
 * through window.__GAME, writes shots/<name>.png plus a shots/report.json.
 *
 *   node tools/shot.mjs                          all shots, 1600x900, quality=high
 *   node tools/shot.mjs hero temple               just those two
 *   node tools/shot.mjs --w 1920 --h 1080 --q ultra
 *   node tools/shot.mjs --out shots/iter3 hero
 *
 * Headless Chromium has no GPU here, so WebGL runs on SwiftShader: a frame can take
 * seconds. Timeouts are generous on purpose.
 *
 * **Ask for the fewest shots that answer your question.** The lock is a fair FIFO, so a run
 * holds it for its whole duration and everyone behind you waits that long. The cost model,
 * measured: ~14 s per frame at 1280x720/high, a `setShot` is 17 frames, so **one shot is 4-6
 * minutes and a full ten-shot set is 40-60 minutes of exclusive hold**.
 *
 * With several agents working, a 10-shot run is a decision to block everyone else for an hour.
 * That has already had a real cost: an agent completed an entire session of geometry work — a
 * collapsed pylon corner, subdivided pyramids, terrain-bedded rubble, a breached temenos wall —
 * and looked at **zero rendered frames**, because captures never reached the front of the
 * queue. Take 1-3 shots, verify the specific thing you changed, release, and re-queue if you
 * need more. Reserve full sets for the critic, which genuinely needs them.
 */
import { chromium } from 'playwright';
import { acquire } from './lock.mjs';
import { spawn, execFileSync } from 'node:child_process';
import { mkdir, writeFile, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import net from 'node:net';

const ROOT = path.resolve(import.meta.dirname, '..');

/**
 * The build inputs that determine the pixels. Scoped deliberately: an unscoped
 * `git status --porcelain` reports every untracked `progress/records/` directory, none of
 * which a render depends on. A guard that fires on noise gets switched off, and a guard that
 * is switched off is the defect it was meant to prevent (§357.1).
 */
const BUILD_INPUTS = ['src/', 'index.html', 'vite.config.js', 'package.json', 'package-lock.json'];

/**
 * Short SHA plus exactly which build inputs are uncommitted. Null outside a git checkout.
 * Never throws.
 *
 * The path LIST is the point, not the boolean. `shots/r12/manifest.json` recorded
 * `dirty: true` and nothing more; when §358 tried to attribute its numbers two days later
 * there was no way to say *what* had been uncommitted, only that something was — so the frame
 * that §336's headline 3.74 rested on turned out to describe a tree nobody can reconstruct.
 * The list is the difference between "unreconstructible" and "reconstructible by re-applying
 * these three files".
 */
function gitDesc() {
  try {
    const run = (a) => execFileSync('git', a, { cwd: ROOT, encoding: 'utf8' });
    /* Do NOT trim the blob before splitting: porcelain lines open with a two-column status
       field, so the first line's leading space is significant and trimming shifts that one
       path left by a character. `tools/charvis.mjs:58` records the same trap after it printed
       `rc/player/Cane.js`. */
    const dirtyPaths = run(['status', '--porcelain', '--', ...BUILD_INPUTS])
      .split('\n').filter((l) => l.length > 3).map((l) => l.slice(3).trim());
    return {
      sha: run(['rev-parse', '--short', 'HEAD']).trim(),
      dirty: dirtyPaths.length > 0,
      dirtyPaths,
    };
  } catch { return null; }
}

/* ------------------------------- args ---------------------------------- */
const argv = process.argv.slice(2);
const opt = (name, dflt) => {
  const i = argv.indexOf(`--${name}`);
  if (i === -1) return dflt;
  const v = argv[i + 1];
  argv.splice(i, 2);
  return v;
};
const flag = (name) => {
  const i = argv.indexOf(`--${name}`);
  if (i === -1) return false;
  argv.splice(i, 1);
  return true;
};

const WIDTH = parseInt(opt('w', '1600'), 10);
const HEIGHT = parseInt(opt('h', '900'), 10);
const QUALITY = opt('q', 'high');
const OUTDIR = path.resolve(ROOT, opt('out', 'shots'));
const TIMEOUT = parseInt(opt('timeout', '240000'), 10);
/* Per-shot deadline. A `setShot` is 17 frames and a frame costs ~14 s at 1280x720 on this
   container's software rasteriser, so a legitimate shot runs 4-6 minutes and contention can
   double that. 15 minutes is generous enough never to fire on a healthy run and short enough
   that a wedged one fails the shot rather than the session. */
const SHOT_TIMEOUT = parseInt(opt('shotTimeout', String(15 * 60 * 1000)), 10);
const KEEP = flag('keep');
const VERBOSE = flag('verbose');
/* Render anyway with build inputs uncommitted. See the guard at the top of main(). */
const ALLOW_DIRTY = flag('allow-dirty');
const requested = argv.filter((a) => !a.startsWith('--'));

/* --------------------------- dev server -------------------------------- */
async function freePort(start = 5300) {
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
  if (!existsSync(bin)) throw new Error('vite not installed — run npm install');
  const proc = spawn(bin, ['--port', String(port), '--strictPort', '--host', '127.0.0.1'], {
    cwd: ROOT,
    stdio: ['ignore', 'pipe', 'pipe'],
    // SANDS_NO_HMR: freeze the build for the duration of the capture (see vite.config.js).
    // Without it, an agent editing src/ mid-capture triggers a reload that destroys the
    // page's execution context and fails the shot.
    env: { ...process.env, NO_COLOR: '1', SANDS_NO_HMR: '1' },
  });
  let log = '';
  proc.stdout.on('data', (d) => { log += d; if (VERBOSE) process.stdout.write(`[vite] ${d}`); });
  proc.stderr.on('data', (d) => { log += d; if (VERBOSE) process.stderr.write(`[vite] ${d}`); });

  const deadline = Date.now() + 60000;
  while (Date.now() < deadline) {
    if (/localhost:\d+|ready in/i.test(log)) break;
    if (proc.exitCode !== null) throw new Error(`vite exited (${proc.exitCode}):\n${log}`);
    await new Promise((r) => setTimeout(r, 250));
  }
  // Poll the port rather than trusting the banner.
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

/* ------------------------------- main ---------------------------------- */

/**
 * Refuse to render from a tree whose build inputs are uncommitted, unless told to.
 *
 * This runs FIRST — before the output directory exists and before the capture lock is
 * requested — so a tree that cannot produce evidence never joins the FIFO and never makes
 * anyone else wait behind it.
 *
 * Why it fails instead of annotating. `gitDesc()` has always computed `dirty`, and the
 * manifest has always recorded it, and **nothing has ever read it**. `shots/r12/` was rendered
 * from `0525d5e` + uncommitted changes on 2026-08-13; its frames then carried §336's headline
 * `R/G 3.74` through §341, §342, §342.1 and §342.2 before §358 established that the tree could
 * not be reconstructed and the number was therefore unattributable — not wrong, which is
 * recoverable, but unattributable, which for a project that seals bars against shas is worse.
 * A flag that is computed and never consulted is precisely §357.1's pattern: a guard that
 * exists is not a guard that runs.
 *
 * Why an escape hatch exists. This file's own header (:167) notes that agent work is routinely
 * uncommitted when a capture runs, and that is legitimate for iteration — you change a shader,
 * you look at a frame. Making that impossible would get the guard deleted. So the unsafe path
 * stays open and becomes *loud and recorded*: `--allow-dirty` renders, and the manifest says
 * the operator knew. What is no longer possible is producing an unreconstructible frame
 * silently and discovering two days later that a lineage was built on it.
 */
function assertReconstructible(desc) {
  if (!desc || !desc.dirty || ALLOW_DIRTY) return;
  process.stderr.write(
    `\nREFUSING TO RENDER — ${desc.dirtyPaths.length} build input(s) uncommitted at ${desc.sha}:\n`
    + desc.dirtyPaths.map((p) => `    ${p}\n`).join('')
    + '\nFrames from this tree cannot be reconstructed by anyone, including you, so they cannot\n'
    + 'be cited as evidence later (§358: shots/r12/ is exactly this, and it cost a lineage).\n\n'
    + '  commit the changes  → the frames become attributable to a sha, or\n'
    + '  re-run with --allow-dirty → renders anyway and records the choice in the manifest.\n\n'
    + 'Scope is src/, index.html, vite.config.js, package*.json. Untracked records are ignored.\n',
  );
  process.exit(2);
}

async function main() {
  const provenance = gitDesc();
  assertReconstructible(provenance);
  if (provenance?.dirty) {
    process.stdout.write(`· WARNING: rendering DIRTY (--allow-dirty) — ${provenance.dirtyPaths.length} uncommitted build input(s)\n`);
    for (const p of provenance.dirtyPaths) process.stdout.write(`    ${p}\n`);
  }

  await mkdir(OUTDIR, { recursive: true });

  // Serialise with other capture runs — software rendering doesn't parallelise, it thrashes.
  const release = await acquire({
    onWait: (ms, pid) => process.stdout.write(`· waiting for capture lock (${(ms / 1000) | 0}s, held by pid ${pid})\n`),
  });
  process.on('exit', release);

  const port = await freePort();
  process.stdout.write(`· starting dev server on :${port}\n`);
  const server = await startServer(port);

  // The container ships a pinned Chromium that predates this Playwright's expected revision,
  // so point at it directly rather than letting Playwright hunt for a download it can't fetch.
  const CHROME = process.env.CHROME_PATH
    || ['/opt/pw-browsers/chromium', '/usr/bin/chromium', '/usr/bin/chromium-browser']
       .find((p) => existsSync(p));

  const browser = await chromium.launch({
    executablePath: CHROME,
    args: [
      '--no-sandbox',
      '--disable-dev-shm-usage',
      // No GPU in this container: force ANGLE onto SwiftShader so WebGL2 still initialises.
      '--use-gl=angle',
      '--use-angle=swiftshader',
      '--enable-unsafe-swiftshader',
      '--enable-webgl',
      '--ignore-gpu-blocklist',
      '--disable-frame-rate-limit',
      '--js-flags=--max-old-space-size=4096',
      '--force-device-scale-factor=1',
      '--hide-scrollbars',
      '--mute-audio',
    ],
  });

  /* Stamp the build these frames came from.
     A frame in shots/ carries no provenance, and a stale one is indistinguishable from a
     current one by looking at it. This cost real time: a `temple` PNG was read as evidence of
     a live sky bug when it was 25 commits old and from a camera position that no longer
     existed — the camera had been moved out of the column it was standing inside. `dirty`
     matters as much as the SHA, because agent work is routinely uncommitted when a capture
     runs. */
  const report = {
    at: new Date().toISOString(),
    /* The SAME object the guard in main() ruled on — not a second gitDesc() call. Re-reading
       git here would let a mid-run edit produce a manifest that disagrees with the tree the
       guard actually cleared, which is the reconstructibility hole this whole change closes. */
    commit: provenance,
    /* Present and true only when the operator overrode the guard. Its absence is a positive
       claim: the build inputs were committed when these frames were rendered. */
    ...(provenance?.dirty ? { allowDirty: true } : {}),
    width: WIDTH, height: HEIGHT, quality: QUALITY, shots: {}, errors: [],
  };
  let failures = 0;

  try {
    const ctx = await browser.newContext({
      viewport: { width: WIDTH, height: HEIGHT },
      deviceScaleFactor: 1,
      reducedMotion: 'no-preference',
    });
    const page = await ctx.newPage();

    const consoleErrors = [];
    page.on('console', (m) => {
      const t = m.text();
      if (m.type() === 'error') consoleErrors.push(t);
      if (VERBOSE) console.log(`  [page:${m.type()}] ${t}`);
    });
    page.on('pageerror', (e) => consoleErrors.push(`pageerror: ${e.message}`));

    process.stdout.write('· loading game\n');
    await page.goto(`http://127.0.0.1:${port}/?shot=1&q=${QUALITY}`, {
      waitUntil: 'domcontentloaded', timeout: 90000,
    });

    await page.waitForFunction('window.__GAME && window.__GAME.ready === true', null,
      { timeout: TIMEOUT, polling: 500 });
    process.stdout.write('· ready\n');

    const info = await page.evaluate(() => ({
      shots: window.__GAME.shots,
      modules: window.__GAME.modules(),
      warnings: window.__GAME.warnings.slice(),
      renderer: (() => {
        const gl = window.__ENGINE?.renderer?.getContext?.();
        const d = gl?.getExtension('WEBGL_debug_renderer_info');
        return d ? gl.getParameter(d.UNMASKED_RENDERER_WEBGL) : 'unknown';
      })(),
    }));
    report.modules = info.modules;
    report.bootWarnings = info.warnings;
    report.renderer = info.renderer;

    const present = Object.entries(info.modules).filter(([, v]) => v).map(([k]) => k);
    const absent = Object.entries(info.modules).filter(([, v]) => !v).map(([k]) => k);
    process.stdout.write(`· renderer: ${info.renderer}\n`);
    process.stdout.write(`· modules present (${present.length}): ${present.join(' ') || 'none'}\n`);
    if (absent.length) process.stdout.write(`· modules absent  (${absent.length}): ${absent.join(' ')}\n`);
    if (info.warnings.length) {
      process.stdout.write(`· ${info.warnings.length} boot warning(s):\n`);
      for (const w of info.warnings.slice(0, 12)) process.stdout.write(`    ! ${w}\n`);
    }

    /* Two runs were reported booting cleanly and then dying before the first `✓`, writing
       nothing at all — no report, no partial frames, no error. That is the worst possible
       failure on a container where a single shot costs 2–5 minutes, because it destroys the
       evidence of its own cause. These three guards do not fix whatever kills it; they make it
       impossible for it to die quietly again. */
    page.on('crash', () => {
      process.stdout.write('  ✗ RENDERER CRASHED — the browser page died, not the harness\n');
    });
    page.on('close', () => {
      process.stdout.write('  · page closed\n');
    });
    const flush = async () => {
      // Written after every shot, so a run that dies at shot 7 still hands over shots 1-6.
      await writeFile(path.join(OUTDIR, 'report.json'), JSON.stringify(report, null, 2));
    };

    const names = requested.length ? requested : info.shots;
    for (const name of names) {
      if (!info.shots.includes(name)) {
        process.stdout.write(`  ✗ ${name}: unknown shot\n`);
        report.errors.push(`unknown shot ${name}`);
        failures++;
        continue;
      }
      const t0 = Date.now();
      try {
        /* A per-shot deadline. `page.evaluate` has no timeout of its own, so a wedged frame
           inside `setShot` hangs the whole run with no output — indistinguishable from slow
           progress on a box where 17 frames legitimately take minutes. Racing it turns that
           into a named failure on one shot and lets the rest of the run continue. */
        const res = await Promise.race([
          page.evaluate(
            async (n) => {
              const r = await window.__GAME.setShot(n);
              return { stats: r.stats, warnings: r.warnings.length, png: window.__GAME.capture() };
            },
            name
          ),
          new Promise((_, rej) => setTimeout(
            () => rej(new Error(`timed out after ${(SHOT_TIMEOUT / 1000) | 0}s`)), SHOT_TIMEOUT)),
        ]);
        const file = path.join(OUTDIR, `${name}.png`);
        await writeFile(file, Buffer.from(res.png.split(',')[1], 'base64'));
        const ms = Date.now() - t0;
        report.shots[name] = { file: path.relative(ROOT, file), ms, ...res.stats };
        process.stdout.write(
          `  ✓ ${name.padEnd(13)} ${String(ms).padStart(6)}ms  ` +
          `draws ${String(res.stats.drawCalls).padStart(4)}  tris ${(res.stats.triangles / 1000).toFixed(0)}k\n`
        );
      } catch (err) {
        failures++;
        report.errors.push(`${name}: ${err.message}`);
        process.stdout.write(`  ✗ ${name}: ${err.message.split('\n')[0]}\n`);
      }
      // Hand over what we have after every shot, pass or fail.
      await flush().catch(() => {});
    }

    const runtimeWarnings = await page.evaluate(() => window.__GAME.warnings.slice());
    report.warnings = runtimeWarnings;
    report.consoleErrors = consoleErrors.slice(0, 40);
    if (consoleErrors.length) {
      process.stdout.write(`· ${consoleErrors.length} console error(s):\n`);
      for (const e of consoleErrors.slice(0, 8)) process.stdout.write(`    ! ${e.split('\n')[0]}\n`);
    }
  } finally {
    await browser.close().catch(() => {});
    if (!KEEP) { server.kill('SIGTERM'); setTimeout(() => server.kill('SIGKILL'), 3000); }
    await writeFile(path.join(OUTDIR, 'report.json'), JSON.stringify(report, null, 2));
  }

  process.stdout.write(`\n→ ${path.relative(ROOT, OUTDIR)}/  (${Object.keys(report.shots).length} shots, ${failures} failed)\n`);
  process.exit(failures > 0 && Object.keys(report.shots).length === 0 ? 1 : 0);
}

main().catch(async (err) => {
  console.error('\nharness failed:', err.message);
  process.exit(1);
});

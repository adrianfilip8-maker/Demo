/**
 * prodboot.mjs — boot the PRODUCTION build from a SUBPATH, and fail on any request that 404s.
 *
 * ── Why this did not exist, which is the finding (§666) ───────────────────────────────────────
 *
 * Every verification this project has ever run — `tests/*.test.mjs`, `tools/harness.mjs`,
 * `tools/shot.mjs`, every critic capture, every probe in this lane — loads the **vite dev server
 * at the domain root**. The demo the user plays is a **`vite build` served under `/Demo/`**, and
 * those two differ in exactly the two ways that were biting:
 *
 *   1. **the root.** A leading-slash URL resolves to the origin. At `/` that is right by accident;
 *      under `/Demo/` it is wrong. `src/textures/baked.json` carries `"blob":
 *      "/assets/tex/textures.bin"` — written by `bakeassets.mjs`'s `PUBLIC_URL` — and it bypasses
 *      the bundler entirely, so `base: './'` never touches it.
 *   2. **the emit.** In dev, `src/assets/sly-dl/sly.fbx` sits beside its PNGs and three's FBX
 *      loader resolves the names inside the file against that directory. `vite build` emits the
 *      FBX hashed into `assets/`, and the PNGs under other hashed names, so the same internal
 *      names resolve to files that were never emitted.
 *
 * Both faults are invisible in dev **by construction** and unconditional in production. No amount
 * of dev-server testing could have found either, which is why three playtest rounds did not.
 *
 * This serves `dist/` under a `/Demo/`-shaped prefix — the same shape as a GitHub project page,
 * including 404ing anything outside it — and reports every non-2xx response.
 *
 * Usage:
 *   node tools/prodboot.mjs                 build, serve at /Demo/, boot, report
 *   node tools/prodboot.mjs --no-build      reuse an existing dist/
 *   node tools/prodboot.mjs --prefix /      serve at the root instead (the A/B: both must pass)
 *   node tools/prodboot.mjs --keep          leave the server up and print the URL
 */
import { chromium } from 'playwright';
import { acquire } from './lock.mjs';
import { spawnSync } from 'node:child_process';
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
const PREFIX = (arg('--prefix', '/Demo/') || '/').replace(/\/*$/, '/');
const noBuild = argv.includes('--no-build');

const MIME = {
  '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css',
  '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp',
  '.svg': 'image/svg+xml', '.mp3': 'audio/mpeg', '.bin': 'application/octet-stream',
  '.glb': 'model/gltf-binary', '.gltf': 'model/gltf+json', '.fbx': 'application/octet-stream',
  '.wasm': 'application/wasm', '.map': 'application/json', '.ktx2': 'image/ktx2',
};

async function freePort(s = 5900) {
  for (let p = s; p < s + 400; p++) {
    const ok = await new Promise((r) => { const x = net.createServer(); x.once('error', () => r(false)); x.once('listening', () => x.close(() => r(true))); x.listen(p, '127.0.0.1'); });
    if (ok) return p;
  }
  throw new Error('no free port');
}

/**
 * A GitHub-project-page-shaped static server: everything under PREFIX maps into `dist/`, and
 * everything outside it 404s — which is what turns a leading-slash asset URL into the failure the
 * user photographed, instead of silently working the way a root-served dev server does.
 */
function serve(port) {
  return new Promise((resolve) => {
    const srv = http.createServer((req, res) => {
      const url = decodeURIComponent((req.url || '/').split('?')[0]);
      if (!url.startsWith(PREFIX)) {
        res.writeHead(404, { 'content-type': 'text/plain' });
        res.end(`404 — outside the site prefix ${PREFIX}\n`);
        return;
      }
      let rel = url.slice(PREFIX.length);
      if (rel === '' || rel.endsWith('/')) rel += 'index.html';
      const file = path.join(DIST, rel);
      if (!file.startsWith(DIST) || !existsSync(file) || !statSync(file).isFile()) {
        res.writeHead(404, { 'content-type': 'text/plain' });
        res.end('404\n');
        return;
      }
      res.writeHead(200, {
        'content-type': MIME[path.extname(file)] || 'application/octet-stream',
        'cache-control': 'no-store',
      });
      res.end(readFileSync(file));
    });
    srv.listen(port, '127.0.0.1', () => resolve(srv));
  });
}

/* ------------------------------------------------------------------ build */
if (!noBuild) {
  console.log('[prodboot] vite build --sourcemap false   (matching .github/workflows/pages.yml)');
  const r = spawnSync(path.join(ROOT, 'node_modules', '.bin', 'vite'), ['build', '--sourcemap', 'false'],
    { cwd: ROOT, stdio: 'inherit', env: { ...process.env, NO_COLOR: '1' } });
  if (r.status !== 0) { console.error('[prodboot] build failed'); process.exit(1); }
}
if (!existsSync(path.join(DIST, 'index.html'))) {
  console.error(`[prodboot] no dist/index.html — run without --no-build`);
  process.exit(1);
}

/* ------------------------------------------------------------------- boot */
const release = await acquire({ onWait: (ms) => process.stdout.write(`· waiting for capture lock (${(ms / 1000) | 0}s)\n`) });
const port = await freePort();
const srv = await serve(port);
const url = `http://127.0.0.1:${port}${PREFIX}`;
console.log(`[prodboot] serving dist/ at ${url}`);

const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || CHROME.find((p) => existsSync(p)), args: ARGS });
let misses = [];
const aborts = [];
try {
  const page = await (await browser.newContext({ viewport: { width: 1280, height: 720 } })).newPage();
  const consoleErrors = [];
  const requests = [];
  page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text()); });
  page.on('pageerror', (e) => consoleErrors.push(`pageerror: ${e.message}`));
  /**
   * MISSES and ABORTS are kept apart, and the gate is on misses only.
   *
   * A 4xx/5xx is the server saying the file is not there — the class of both §666 bugs, and the
   * thing that must never ship. `net::ERR_ABORTED` is a CANCELLATION, and this tool closes the
   * browser in a `finally`, so every request still in flight at teardown produces one: ~15-19 of
   * them appear on a clean build and a broken one alike. Failing on both would make the verdict
   * permanently red, and a gate that is always red is a gate nobody reads — which is how this
   * project got here. Aborts are reported as an observation and excluded from the exit code.
   */
  page.on('response', (r) => {
    requests.push({ status: r.status(), url: r.url() });
    if (r.status() >= 400) misses.push(`${r.status()} ${r.url()}`);
  });
  page.on('requestfailed', (r) => aborts.push(`${r.failure()?.errorText || '?'} ${r.url()}`));

  const t0 = Date.now();
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 120000 });

  /* The module chain is the point: `main.js` builds 31 modules and inits them in a SECOND pass,
     with audio 30th of 31 (§551). If a failed asset degrades or stalls that chain, everything
     late in it never arrives — so this reports WHERE it got to, not just whether it finished. */
  let ready = false;
  try {
    await page.waitForFunction('window.__GAME && window.__GAME.ready === true', null, { timeout: 600000, polling: 1000 });
    ready = true;
  } catch { /* fall through and report how far it got */ }
  const bootMs = Date.now() - t0;

  const info = await page.evaluate(() => {
    const e = window.__ENGINE;
    const mods = (() => { try { return window.__GAME.modules(); } catch { return null; } })();
    const a = e?.get?.('audio');
    return {
      ready: !!window.__GAME?.ready,
      modules: mods,
      moduleCount: Array.isArray(mods) ? mods.length : (mods && typeof mods === 'object' ? Object.keys(mods).length : null),
      hasAudioModule: !!a,
      audioAvailable: a ? a.available : null,
      audioReady: a ? a.ready : null,
      warnings: (e?.warnings || []).slice(0, 40),
      texturesWarn: (e?.warnings || []).filter((w) => /textur/i.test(String(w))),
      /* `#bootBuild` reads "dev build" in a local build and is rewritten to "build <sha> · <date>"
         by the `Stamp the build` step in .github/workflows/pages.yml. Reporting it here is how a
         run of this tool says WHICH build it just measured. */
      buildStamp: document.querySelector('#bootBuild')?.textContent?.trim() || null,
    };
  });

  console.log(`\n── PRODUCTION BOOT from ${PREFIX} ──────────────────────────────`);
  console.log(`   ready             ${info.ready}   (${(bootMs / 1000).toFixed(1)} s)`);
  console.log(`   modules           ${info.moduleCount}`);
  console.log(`   audio module      present=${info.hasAudioModule} available=${info.audioAvailable} ready=${info.audioReady}`);
  console.log(`   build stamp       ${info.buildStamp || '(none found)'}`);
  console.log(`   requests          ${requests.length}`);
  console.log(`   engine warnings   ${info.warnings.length}`);
  for (const w of info.texturesWarn) console.log(`     ! ${w}`);

  console.log(`\n── MISSES — 4xx/5xx (${misses.length}) ──`);
  if (misses.length === 0) console.log('   none');
  else for (const f of misses) console.log(`   ${f}`);

  console.log(`\n── aborts — cancelled in flight (${aborts.length}, not gated; see the note above) ──`);
  if (aborts.length === 0) console.log('   none');
  else for (const f of aborts.slice(0, 8)) console.log(`   ${f}`);
  if (aborts.length > 8) console.log(`   … and ${aborts.length - 8} more`);

  if (consoleErrors.length) {
    console.log(`\n── console errors (${consoleErrors.length}, first 12) ──`);
    for (const c of consoleErrors.slice(0, 12)) console.log(`   ${c}`);
  }

  console.log(`\n── VERDICT ──`);
  console.log(`   boot completed past module 30 (audio): ${info.hasAudioModule && info.ready}`);
  console.log(`   zero 4xx/5xx:                          ${misses.length === 0}`);
  console.log(`   (aborts, not gated:                    ${aborts.length})`);
  if (misses.length) process.exitCode = 1;
  if (!info.ready) process.exitCode = 1;

  if (argv.includes('--keep')) {
    console.log(`\n[prodboot] --keep: ${url} still up. Ctrl-C to stop.`);
    await new Promise(() => {});
  }
} finally {
  await browser.close().catch(() => {});
  srv.close();
  release();
}

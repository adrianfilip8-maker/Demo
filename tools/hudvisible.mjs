#!/usr/bin/env node
/**
 * hudvisible.mjs — §731 follow-up: is the health ornament visible to a PLAYER, in the artifact a
 * player actually loads?
 *
 * ── Why this exists, and why `hudhealth.mjs` could not answer it ─────────────────────────────
 *
 * The owner, on the deployed build: *"The health bar still does not appear"*, and *"It should
 * always be present in the corner"*. `hudhealth.mjs` had reported the ornament present, clear of
 * every element and legible on both grades. Both cannot be right, and the measurement is the
 * thing under suspicion, because of exactly how it was taken:
 *
 *   · **it staged.** Arm A drove every element to its widest state first, and a rect measured on
 *     a page the tool arranged is not evidence about the page a player is looking at (§442: a
 *     correct measurement of the wrong subject).
 *   · **it froze.** Arm A injects `transition: none !important` to read settled values, so
 *     anything whose visibility depends on an animation or a transition was read at a value the
 *     player never sees.
 *   · **it was never the shipped artifact.** Every arm loaded the **vite dev server at the domain
 *     root**. §666 is the standing lesson that this differs from `vite build` served under
 *     `/Demo/` *by construction*, and that no amount of dev-server testing can find the
 *     difference.
 *   · **its presence check never looked at opacity.** Arm C's sampler returned 'absent' only when
 *     `querySelector` missed. An element at `opacity: 0` counted as present in 14/14 frames.
 *
 * So this tool changes the subject to the real one and removes every liberty:
 *   1. `vite build`, served under a `/Demo/`-shaped prefix (prodboot.mjs's server shape).
 *   2. Booted the way a player boots it — navigate, wait, look. No staging, no injected CSS, no
 *      events emitted, no `stopLoop` during the visibility read, no debug hooks.
 *   3. The verdict is not a rect. It is **pixels**: with the loop stopped, ONE frame is captured
 *      as the player has it, the ornament node is then hidden, and the identical frame is
 *      captured again. A rect proves an element is in the layout; only the diff proves it PAINTS.
 *      (An earlier version differenced two separate boots, one with `?hud=nohealth` — two page
 *      loads mean two different scenes, the control corner came back 47 % changed and the
 *      calibration refused the number.) `page.screenshot()` composites the DOM, unlike
 *      `__GAME.capture()`, which reads the WebGL buffer and by design never contains the HUD.
 *
 * The control is the fail arm (§418.3): the SAME diff is computed over `.sly-tl`'s corner, which
 * hiding `.sly-hp` cannot touch — and its pixel SPREAD is asserted too, because "the control did
 * not change" reads identically to "both frames are the same blank veil".
 *
 *   node tools/hudvisible.mjs                  build, serve at /Demo/, measure
 *   node tools/hudvisible.mjs --no-build       reuse dist/
 *   node tools/hudvisible.mjs --prefix /       the A/B: root-served must pass too
 */
import { chromium } from 'playwright';
import { acquire } from './lock.mjs';
import { spawnSync } from 'node:child_process';
import { existsSync, statSync, readFileSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { PNG } from 'pngjs';
import path from 'node:path';
import http from 'node:http';
import net from 'node:net';

const ROOT = path.resolve(import.meta.dirname, '..');
const DIST = path.join(ROOT, 'dist');
const argv = process.argv.slice(2);
const arg = (n, d) => { const i = argv.indexOf(n); return i >= 0 ? argv[i + 1] : d; };
const PREFIX = (arg('--prefix', '/Demo/') || '/').replace(/\/*$/, '/');
const noBuild = argv.includes('--no-build');
const OUTDIR = path.resolve(ROOT, arg('--out', 'shots/hud731v'));
const W = 1280, H = 720;

const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.svg': 'image/svg+xml', '.mp3': 'audio/mpeg',
  '.bin': 'application/octet-stream', '.glb': 'model/gltf-binary', '.gltf': 'model/gltf+json',
  '.fbx': 'application/octet-stream', '.wasm': 'application/wasm', '.ktx2': 'image/ktx2', '.map': 'application/json' };

async function freePort(s = 5960) {
  for (let p = s; p < s + 400; p++) {
    const ok = await new Promise((r) => { const x = net.createServer(); x.once('error', () => r(false)); x.once('listening', () => x.close(() => r(true))); x.listen(p, '127.0.0.1'); });
    if (ok) return p;
  }
  throw new Error('no free port');
}

/** A GitHub-project-page-shaped static server: everything outside PREFIX 404s. */
function serve(port) {
  return new Promise((resolve) => {
    const srv = http.createServer((req, res) => {
      const url = decodeURIComponent((req.url || '/').split('?')[0]);
      if (!url.startsWith(PREFIX)) { res.writeHead(404); res.end('outside prefix'); return; }
      let rel = url.slice(PREFIX.length);
      if (rel === '' || rel.endsWith('/')) rel += 'index.html';
      const file = path.join(DIST, rel);
      if (!file.startsWith(DIST) || !existsSync(file) || !statSync(file).isFile()) { res.writeHead(404); res.end('404'); return; }
      res.writeHead(200, { 'content-type': MIME[path.extname(file)] || 'application/octet-stream', 'cache-control': 'no-store' });
      res.end(readFileSync(file));
    });
    srv.listen(port, '127.0.0.1', () => resolve(srv));
  });
}

/**
 * What the page can tell us about an element WITHOUT the tool touching anything.
 *
 * `opacityChain` walks to the root multiplying every ancestor's opacity, because an element at
 * `opacity: 1` inside a container at 0 is invisible and its own computed style says nothing about
 * it — the exact hole that let the earlier tool report the ornament present in 14/14 frames.
 */
/* A real function, not a string: `page.evaluate` treats a STRING as an expression to evaluate and
   silently ignores the argument, so the first version of this returned the function object rather
   than calling it, and every probe came back undefined. */
const PROBE = (sels) => {
  const out = {};
  for (const sel of sels) {
    const el = document.querySelector(sel);
    if (!el) { out[sel] = { sel, exists: false }; continue; }
    const cs = getComputedStyle(el);
    const r = el.getBoundingClientRect();
    let eff = 1, node = el;
    const chain = [];
    while (node && node !== document.documentElement) {
      const s = getComputedStyle(node);
      const o = parseFloat(s.opacity);
      if (o < 1 || s.display === 'none' || s.visibility === 'hidden') {
        const cls = typeof node.className === 'string' && node.className.trim()
          ? '.' + node.className.trim().split(/\s+/).join('.') : '';
        chain.push(`${node.tagName.toLowerCase()}${node.id ? '#' + node.id : ''}${cls} `
          + `{opacity:${s.opacity}, display:${s.display}, visibility:${s.visibility}}`);
      }
      eff *= isNaN(o) ? 1 : o;
      if (s.display === 'none' || s.visibility === 'hidden') eff = 0;
      node = node.parentElement;
    }
    out[sel] = { sel, exists: true,
      x: +r.x.toFixed(1), y: +r.y.toFixed(1), w: +r.width.toFixed(1), h: +r.height.toFixed(1),
      right: +r.right.toFixed(1), bottom: +r.bottom.toFixed(1),
      display: cs.display, visibility: cs.visibility, opacity: cs.opacity, zIndex: cs.zIndex,
      fontSize: cs.fontSize, unit: getComputedStyle(document.getElementById('sly-hud')).getPropertyValue('--u').trim(),
      effectiveOpacity: +eff.toFixed(4), hiddenAncestors: chain,
      inViewport: r.right > 0 && r.bottom > 0 && r.x < window.innerWidth && r.y < window.innerHeight };
  }
  return out;
};

const crop = (png, box) => {
  const x0 = Math.max(0, Math.floor(box.x)), y0 = Math.max(0, Math.floor(box.y));
  const x1 = Math.min(png.width, Math.ceil(box.right)), y1 = Math.min(png.height, Math.ceil(box.bottom));
  const out = [];
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      const i = (png.width * y + x) << 2;
      out.push([png.data[i], png.data[i + 1], png.data[i + 2]]);
    }
  }
  return out;
};

/** How much of `box` actually changed between the two frames, and by how much. */
function diffBox(a, b, box, thresh = 12) {
  const A = crop(a, box), B = crop(b, box);
  const n = Math.min(A.length, B.length);
  let changed = 0, sum = 0, max = 0;
  for (let i = 0; i < n; i++) {
    const d = (Math.abs(A[i][0] - B[i][0]) + Math.abs(A[i][1] - B[i][1]) + Math.abs(A[i][2] - B[i][2])) / 3;
    sum += d; if (d > max) max = d;
    if (d > thresh) changed++;
  }
  return { px: n, changedPct: +(100 * changed / Math.max(1, n)).toFixed(2),
           meanDelta: +(sum / Math.max(1, n)).toFixed(2), maxDelta: +max.toFixed(1) };
}

/**
 * Capture through CDP rather than `page.screenshot()`.
 *
 * `page.screenshot()` waits for fonts and then for the compositor to produce a stable frame. With
 * the veil up (a static panel) that returns; with the game actually running under software
 * rasterisation it logs "fonts loaded" and then hangs until the timeout — which is the hazard
 * `cardshot.mjs` already recorded, and which §731.0 had marked as not reproducing, because it
 * only ever captured the veil. `Page.captureScreenshot` takes what is on screen now and does not
 * wait for stability, which is what a measurement of a live frame wants anyway.
 */
async function shoot(page, file) {
  const cdp = await page.context().newCDPSession(page);
  const { data } = await cdp.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
  const buf = Buffer.from(data, 'base64');
  await writeFile(file, buf);
  await cdp.detach().catch(() => {});
  return PNG.sync.read(buf);
}

async function boot(browser, url, q) {
  const page = await (await browser.newContext({ viewport: { width: W, height: H } })).newPage();
  const errs = [];
  page.on('pageerror', (e) => errs.push(`pageerror: ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
  await page.goto(url + q, { waitUntil: 'domcontentloaded', timeout: 180000 });
  await page.waitForFunction('window.__GAME && window.__GAME.ready === true', null, { timeout: 900000, polling: 500 });

  /**
   * DISMISS THE BOOT VEIL, the way a player does — and this is the whole reason the first run of
   * this tool measured nothing.
   *
   * `__GAME.ready === true` is NOT the state the player is looking at. `main.js:304` arms a
   * "Click to play" overlay and only removes `#boot` on a real `pointerdown` or `keydown`
   * (`main.js:313-314`); the veil is `display: grid, opacity: 1` until then and covers the
   * entire viewport. Every earlier probe in this lane waited for `ready` and then screenshot the
   * VEIL — which is why the first run reported the ornament's corner and the control corner both
   * 0% changed: both frames were the same full-screen loading panel. Layout still happens
   * underneath, which is exactly why the rect probes looked healthy and the pixels did not.
   *
   * A real mouse click, not a dispatched synthetic event, because that is what the listener is
   * bound to and what a player does.
   */
  await page.mouse.click(Math.floor(W / 2), Math.floor(H / 2));
  await page.waitForFunction(() => {
    const b = document.getElementById('boot');
    return !b || b.classList.contains('gone');
  }, null, { timeout: 30000 });
  await page.waitForTimeout(1200);          // main.js removes the node 700 ms after 'gone'
  /* A player looks at the screen for a moment before deciding a thing is not there. Nothing is
     staged in this pause; the game just runs. */
  await page.waitForTimeout(2500);
  return { page, errs };
}

/**
 * Does the RENDERED badge still carry the mark, at the size it actually ships?
 *
 * `hud.test.mjs` proves the path data describes the mask; that is a claim about geometry and it
 * would still pass if the glyph rendered four pixels wide. This is the other half: crop one badge
 * out of the production frame and count what is actually on screen — all four inks present, and
 * exactly TWO separate near-white regions, which are the eye slits. Two blobs of near-white with
 * navy between them is the cheapest machine-checkable statement of "it reads as the mask".
 */
function badgeFeatures(png, box) {
  const x0 = Math.max(0, Math.floor(box.x)), y0 = Math.max(0, Math.floor(box.y));
  const x1 = Math.min(png.width, Math.ceil(box.right)), y1 = Math.min(png.height, Math.ceil(box.bottom));
  const w = x1 - x0, h = y1 - y0;
  const px = [];
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (png.width * (y0 + y) + (x0 + x)) << 2;
      px.push([png.data[i], png.data[i + 1], png.data[i + 2]]);
    }
  }
  const near = (p, t, tol) => Math.abs(p[0] - t[0]) <= tol && Math.abs(p[1] - t[1]) <= tol && Math.abs(p[2] - t[2]) <= tol;
  /* §731.5's composed METER: the artwork's insignia inks plus the PAL.blue fill painted through
     the silhouette. `fill` is the character's outfit blue (0x2f5fc4) — if it is absent the mask
     never resolved and the meter is showing as an empty grey track. */
  const TARGET = { navy: [38, 38, 113], grey: [197, 197, 197], outline: [26, 26, 26],
                   fill: [47, 95, 196] };
  const counts = {};
  for (const k of Object.keys(TARGET)) counts[k] = px.filter((p) => near(p, TARGET[k], 40)).length;

  /* Connected components of the pale-grey regions, 4-connected. The mark has THREE of them at
     full resolution — two eye patches and the muzzle — and the two eye patches are the pair that
     decides whether it reads as a face. */
  const isSlit = px.map((p) => near(p, TARGET.grey, 52));
  const seen = new Uint8Array(w * h);
  let blobs = 0;
  const sizes = [];
  for (let i = 0; i < w * h; i++) {
    if (!isSlit[i] || seen[i]) continue;
    let n = 0;
    const stack = [i];
    seen[i] = 1;
    while (stack.length) {
      const c = stack.pop(); n++;
      const cx = c % w, cy = (c / w) | 0;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = cx + dx, ny = cy + dy;
        if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
        const j = ny * w + nx;
        if (isSlit[j] && !seen[j]) { seen[j] = 1; stack.push(j); }
      }
    }
    if (n >= 3) { blobs++; sizes.push(n); }      // ignore single-pixel antialiasing specks
  }
  return { box: [w, h], counts, greyBlobs: blobs, greySizes: sizes.sort((a, b) => b - a).slice(0, 4) };
}

/**
 * How many pixels inside `box` reproduce `target` exactly enough — the guard against measuring a
 * capture that cannot report a colour at all (§743). Pointed at an element whose ink is FIXED by
 * the stylesheet, in the same frame as the subject, it separates "the artwork is wrong" from
 * "this frame is tone-shifted".
 */
function inkFidelity(png, box, target, tol) {
  let n = 0;
  for (const [r, g, b] of crop(png, box)) {
    if (Math.abs(r - target[0]) <= tol && Math.abs(g - target[1]) <= tol && Math.abs(b - target[2]) <= tol) n++;
  }
  return n;
}

/** Single-image stats for a box — the guard against measuring a uniform blank. */
function boxStats(png, box) {
  const px = crop(png, box);
  let lo = 255, hi = 0, sum = 0;
  const seen = new Set();
  for (const [r, g, b] of px) {
    const Y = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    if (Y < lo) lo = Y; if (Y > hi) hi = Y;
    sum += Y;
    seen.add((r >> 3) << 10 | (g >> 3) << 5 | (b >> 3));
  }
  const mean = sum / Math.max(1, px.length);
  let v = 0;
  for (const [r, g, b] of px) { const Y = 0.2126 * r + 0.7152 * g + 0.0722 * b; v += (Y - mean) ** 2; }
  return { px: px.length, lumaMin: +lo.toFixed(1), lumaMax: +hi.toFixed(1), lumaMean: +mean.toFixed(1),
           stdev: +Math.sqrt(v / Math.max(1, px.length)).toFixed(2), colours: seen.size };
}

async function run() {
  await mkdir(OUTDIR, { recursive: true });
  if (!noBuild) {
    console.log('[hudvisible] vite build --sourcemap false');
    const r = spawnSync(path.join(ROOT, 'node_modules', '.bin', 'vite'), ['build', '--sourcemap', 'false'],
      { cwd: ROOT, stdio: 'inherit', env: { ...process.env, NO_COLOR: '1' } });
    if (r.status !== 0) { console.error('build failed'); process.exit(1); }
  }
  if (!existsSync(path.join(DIST, 'index.html'))) { console.error('no dist/index.html'); process.exit(1); }

  console.log('[hudvisible] waiting for capture lock…');
  const release = await acquire({ onWait: (ms) => process.stdout.write(`· queued (${(ms / 1000) | 0}s)\n`) });
  const port = await freePort();
  const srv = await serve(port);
  const url = `http://127.0.0.1:${port}${PREFIX}`;
  console.log(`[hudvisible] serving dist/ at ${url}  (prefix ${PREFIX})`);
  const browser = await chromium.launch({
    executablePath: ['/opt/pw-browsers/chromium', '/usr/bin/chromium', '/usr/bin/chromium-browser'].find(existsSync),
    args: ['--no-sandbox', '--disable-dev-shm-usage', '--use-gl=angle', '--use-angle=swiftshader',
      '--enable-unsafe-swiftshader', '--enable-webgl', '--ignore-gpu-blocklist', '--hide-scrollbars',
      '--force-device-scale-factor=1', '--mute-audio', '--js-flags=--max-old-space-size=4096'],
  });
  const report = { prefix: PREFIX, when: new Date().toISOString(), viewport: [W, H] };
  let bad = 0;
  const fail = (m) => { console.log(`  !! ${m}`); bad++; };
  try {
    /* ---- 1. the player's boot, untouched ------------------------------------------------ */
    const { page, errs } = await boot(browser, url, '');
    report.consoleErrors = errs.slice(0, 12);
    if (errs.length) console.log(`[hudvisible] ${errs.length} console/page error(s); first: ${errs[0]}`);

    /* §743 moved `.sly-hp` into the corner `.sly-obj` vacated, so the census subject changed and
       so did the neighbour set. Everything persistent is probed, not just the old top-left stack:
       a clearance is only worth quoting if the thing it was measured against is in the list. The
       Binocucom's own top-right pair is probed separately below, because it does not exist until
       the optics are up. */
    const SELS = ['.sly-hp', '.sly-hp-meter', '.sly-shake',
      '.sly-tl', '.sly-coins', '.sly-threat', '.sly-carry',
      '.sly-toasts', '.sly-prompt', '.sly-goal', '.sly-pocket', '.sly-alert', '.sly-obj'];
    const probes = await page.evaluate(PROBE, SELS);
    report.probes = probes;
    /* If the probe itself came back empty the run proves nothing — say so rather than reading
       `.exists` off undefined, which is how the first attempt died. */
    for (const s of SELS) if (!probes[s]) throw new Error(`the probe returned nothing for ${s} — it is broken, not the HUD`);
    console.log('\n[hudvisible] as rendered on a PRODUCTION boot, nothing staged, nothing frozen:');
    for (const s of SELS) {
      const p = probes[s];
      if (!p.exists) { console.log(`    ${s.padEnd(14)} DOES NOT EXIST`); continue; }
      console.log(`    ${s.padEnd(14)} ${String(p.x).padStart(7)},${String(p.y).padStart(6)}  ${String(p.w).padStart(6)}x${String(p.h).padStart(5)}  `
        + `opacity ${p.opacity} (effective ${p.effectiveOpacity})  ${p.display}/${p.visibility}  inViewport=${p.inViewport}`);
      if (p.hiddenAncestors.length) console.log(`        ↳ dimmed/hidden by: ${p.hiddenAncestors.join(' | ')}`);
    }
    const hp = probes['.sly-hp'];
    if (!hp.exists) fail('.sly-hp is not in the production DOM at all');
    else {
      if (hp.w < 1 || hp.h < 1) fail(`.sly-hp has a degenerate box (${hp.w}x${hp.h})`);
      if (hp.effectiveOpacity === 0) fail('.sly-hp is at effective opacity 0 — something in its ancestry is hiding it');
      if (!hp.inViewport) fail('.sly-hp is laid out off-screen');
    }
    const hudFlags = await page.evaluate(() => {
      const r = document.getElementById('sly-hud');
      return { hidden: r?.dataset.hidden, binoc: r?.dataset.binoc,
               hideHud: !!window.__ENGINE?.debug?.hideHud,
               bootVeil: (() => { const b = document.getElementById('boot'); if (!b) return 'absent';
                 const s = getComputedStyle(b); return `${s.display}/${s.opacity}`; })() };
    });
    report.hudFlags = hudFlags;
    console.log(`    #sly-hud data-hidden=${hudFlags.hidden} data-binoc=${hudFlags.binoc}  debug.hideHud=${hudFlags.hideHud}  #boot=${hudFlags.bootVeil}`);
    if (hudFlags.hidden === '1') fail("#sly-hud carries data-hidden='1' on an ordinary boot");

    /* ---- 2. does it PAINT? pixels, not rects --------------------------------------------- */
    /**
     * ONE boot, ONE frame, and the ornament is the only thing that differs between the captures.
     *
     * The first version of this compared a default boot against a separate `?hud=nohealth` boot.
     * That is two page loads, so the camera, the guards and the whole scene behind the corner
     * differ too — the control corner came back 47 % changed and the calibration correctly
     * refused the number. The token belongs to arm 3; it is not a way to get a background plate.
     *
     * So: stop the loop (the scene is now frozen and no further frames are drawn), capture the
     * page EXACTLY as the player has it, then remove the ornament node and capture the identical
     * frame again. The difference is the ornament and nothing else, by construction. The first
     * capture is the untouched player view; the second is only ever used as its background.
     */
    await page.evaluate(() => { window.__ENGINE.stopLoop(); for (let i = 0; i < 3; i++) window.__ENGINE.renderFrame(1 / 60); });
    /* SETTLE, and this line is a bug fix rather than caution (§743).
       `Page.captureScreenshot` deliberately does NOT wait for a stable frame — that is why it is
       used here at all, because `page.screenshot()` hangs waiting for one. The cost is that it
       will happily return a frame the compositor has not finished blending, and `.sly-hp-meter`
       carries a `filter: drop-shadow()` which puts it on its own raster layer. Caught by reading
       the meter's own inks out of this capture: they came back pulled toward the background —
       [43,72,142] where the artwork paints [47,95,196] — while the SAME frame captured after a
       wait, and every staged grade capture below (which already had a 200 ms wait), read the ink
       values exactly. The `without` capture already waited 250 ms; only this one did not, so the
       two halves of the diff were not taken under the same conditions.
       §418.3, both inputs: with this wait the untouched-boot badge arm reads the artwork's exact
       inks; with it removed it reads 0 px of fill and 0 px of pale grey on the same build. */
    await page.waitForTimeout(400);
    const withPng = await shoot(page, path.join(OUTDIR, 'prod-with.png'));
    const removed = await page.evaluate(() => {
      const el = document.querySelector('.sly-hp');
      if (!el) return false;
      el.style.setProperty('display', 'none', 'important');
      return true;
    });
    if (!removed) fail('could not hide .sly-hp for the background capture');
    await page.waitForTimeout(250);
    const withoutPng = await shoot(page, path.join(OUTDIR, 'prod-without.png'));
    await page.evaluate(() => { const el = document.querySelector('.sly-hp'); if (el) el.style.removeProperty('display'); });

    console.log('\n[hudvisible] PIXELS — same corner, ornament vs ?hud=nohealth:');
    const boxes = {
      '.sly-hp (§731)': hp.exists ? hp : null,
      '.sly-tl (control the owner sees)': probes['.sly-tl'].exists ? probes['.sly-tl'] : null,
    };
    report.pixels = {};
    for (const [label, b] of Object.entries(boxes)) {
      if (!b) { console.log(`    ${label}: no box`); continue; }
      const d = diffBox(withPng, withoutPng, b);
      report.pixels[label] = d;
      console.log(`    ${label.padEnd(34)} ${String(d.px).padStart(6)} px   changed ${String(d.changedPct).padStart(6)}%   mean Δ ${String(d.meanDelta).padStart(6)}   max Δ ${d.maxDelta}`);
    }
    const hpDiff = report.pixels['.sly-hp (§731)'];
    if (hpDiff && hpDiff.changedPct < 1) {
      fail(`the ornament's own rect is ${hpDiff.changedPct}% different with it on vs off — it is NOT PAINTING`);
    }
    /* CALIBRATION, in two halves — the first run had only the first and it was not enough.
       (a) the control corner must NOT change, or the diff is not isolating the ornament; and
       (b) the frame must actually CONTAIN something. A 0 % control reads identically whether the
           diff is clean or both screenshots are the same blank veil, which is exactly the trap
           the first run fell into. So the control corner's own pixel spread is asserted: a real
           HUD corner is high-contrast and many-coloured, a loading panel is flat. */
    const tlDiff = report.pixels['.sly-tl (control the owner sees)'];
    const tlStats = boxStats(withPng, probes['.sly-tl']);
    report.controlStats = tlStats;
    console.log(`    control corner content: luma ${tlStats.lumaMin}..${tlStats.lumaMax} (mean ${tlStats.lumaMean}, stdev ${tlStats.stdev}), ${tlStats.colours} distinct colours`);
    if (tlStats.stdev < 6 || tlStats.colours < 24) {
      fail(`CALIBRATION FAILED — the control corner is nearly uniform (stdev ${tlStats.stdev}, ${tlStats.colours} colours). The frame is not showing the game, so every pixel number here is meaningless`);
    } else if (tlDiff && tlDiff.changedPct > 2) {
      fail(`CALIBRATION FAILED — the control corner changed ${tlDiff.changedPct}% while only .sly-hp was hidden, so the diff is not isolating the ornament`);
    } else if (tlDiff) {
      console.log(`    calibration: control corner has real content and changed ${tlDiff.changedPct}% — the diff isolates the ornament`);
    }
    /* And the ornament's own corner, for the record: what is actually there. */
    if (hp.exists) {
      const on = boxStats(withPng, hp), off = boxStats(withoutPng, hp);
      report.ornamentStats = { on, off };
      console.log(`    ornament corner WITH   : luma ${on.lumaMin}..${on.lumaMax} (mean ${on.lumaMean}, stdev ${on.stdev}), ${on.colours} colours`);
      console.log(`    ornament corner WITHOUT: luma ${off.lumaMin}..${off.lumaMax} (mean ${off.lumaMean}, stdev ${off.stdev}), ${off.colours} colours`);
    }

    /* ---- 3. conspicuity, stated plainly -------------------------------------------------- */
    if (hp.exists) {
      const areaPct = (hp.w * hp.h) / (W * H) * 100;
      const tl = probes['.sly-tl'];
      console.log('\n[hudvisible] SIZE, against the cluster the owner does see:');
      console.log(`    .sly-hp  ${hp.w} x ${hp.h} = ${(hp.w * hp.h) | 0} px²  (${areaPct.toFixed(2)}% of the frame)`);
      if (tl.exists) {
        console.log(`    .sly-tl  ${tl.w} x ${tl.h} = ${(tl.w * tl.h) | 0} px²  (${((tl.w * tl.h) / (W * H) * 100).toFixed(2)}%)  — ${((tl.w * tl.h) / (hp.w * hp.h)).toFixed(1)}x the ornament`);
      }
      report.size = { hp: [hp.w, hp.h], areaPct: +areaPct.toFixed(3) };
    }

    /* ---- 2b. does the RENDERED badge still carry the mark? ------------------------------- */
    /**
     * WITH A COLOUR-FIDELITY GATE IN FRONT OF IT (§743), because without one this arm reports a
     * defect in the ARTWORK when the fault is in the CAPTURE.
     *
     * The verdict is "how many pixels of this crop are within tol of an exact ink value", which
     * silently assumes the capture reproduces exact sRGB. The FIRST capture of a boot does not
     * always: measured on this build, the untouched-boot frame contains not one pixel of
     * `--gold-l` (#ffe9a8) anywhere inside `.sly-coins` — the whole composited page, DOM
     * included, comes back tone-shifted, with the frame's brightest pixel at 240 — while the
     * staged grade captures further down reproduce #ffe9a8 and #1a1210 exactly. Read without
     * this gate the arm said "0 px of fill, 0 px of grey, the insignia has stopped reading",
     * which is a claim about the meter made from a frame that could not report a colour.
     *
     * So a KNOWN HUD colour in a DIFFERENT element of the SAME frame is the calibration
     * (§731.2's trap 5, in colour rather than in content): if the frame cannot reproduce the
     * coin counter's gold, the ink counts are printed as UNPROVEN and no verdict is read off
     * them. The grade captures below carry the real legibility claim.
     */
    if (probes['.sly-hp-meter'].exists) {
      const f = badgeFeatures(withPng, probes['.sly-hp-meter']);
      report.badge = f;
      const fid = probes['.sly-coins'].exists ? inkFidelity(withPng, probes['.sly-coins'], [255, 233, 168], 8) : -1;
      report.captureFidelity = fid;
      console.log('\n[hudvisible] the badge as RENDERED, cropped out of the production frame:');
      console.log(`    ${f.box[0]} x ${f.box[1]} px   fill ${f.counts.fill} px, navy ${f.counts.navy} px, `
        + `grey ${f.counts.grey} px, outline ${f.counts.outline} px`);
      console.log(`    separate pale-grey regions: ${f.greyBlobs} (sizes ${JSON.stringify(f.greySizes)}) — two eye patches plus the muzzle`);
      console.log(`    colour fidelity of THIS capture: ${fid} px of --gold-l (#ffe9a8) inside .sly-coins`);
      if (fid < 20) {
        console.log('    UNPROVEN — this frame does not reproduce a known HUD colour, so the ink counts above'
          + ' are a property of the capture and not of the meter. The grade captures below carry the claim.');
      } else {
        for (const k of ['fill', 'navy', 'grey', 'outline']) {
          if (f.counts[k] < 6) fail(`the rendered meter shows only ${f.counts[k]} px of its ${k} — that ink is not surviving at this size`);
        }
        if (f.greyBlobs < 2) {
          fail(`the rendered meter resolves ${f.greyBlobs} pale-grey regions — the insignia's eye patches are merging`);
        }
      }
    }

    /* ---- 2c. COLLISION in the corner, every neighbour driven to its widest ---------------- */
    /* Phase separation matters: the visibility numbers above were taken on an UNTOUCHED page,
       because that is the claim §731.2 was burned on. A collision census is the opposite kind of
       question — it must be worst case — so the NEIGHBOURS are armed here, after the fact, and
       the ornament itself is still never touched.

       §743: `h.objective()` is still called, and it no longer widens anything on the gameplay
       layer — the card it used to inflate is gone and the objective renders inside the pause cel
       now. It is kept deliberately, as a smoke check that the retained API survives the minifier
       and runs on the production artifact; `.sly-obj`'s absence is asserted with it. */
    await page.evaluate(() => {
      const h = window.__ENGINE.get('hud');
      h.objective('Steal the Eye of Ra from the sealed vault', 'Temple of Ra - Great Courtyard');
      h.setCoins(888888, true);
      h.setHealth(5, 5);
      window.__ENGINE.emit('guardAlert', { id: 'g1', state: 'chase' });
      window.__ENGINE.emit('playerState', 'sneak');
      window.__ENGINE.emit('treasurePickup', { id: 't1', name: 'Scarab of Khepri', value: 1200 });
      /* The toast stack is the nearest persistent neighbour in this corner, so it is driven to
         the width the STYLESHEET allows (max-width: 70vw) rather than to a typical line — a
         clearance measured against a short toast is a claim about that toast (§442). */
      window.__ENGINE.emit('toast', { text: 'The vault under the great hall is open and the Eye of Ra is sitting on its plinth waiting for a thief with the nerve to walk in and take it off the temple' });
      /* And the one thing that can reach ANY corner: a world mark whose subject is off-screen is
         CLAMPED to a margin inset (`HUD._project`), so a guard badge for someone behind the
         camera parks itself in a corner. Driven at a point 60 m to the camera's right and 30 m
         up, built from the camera's own basis so it is off-screen by construction rather than by
         a guessed world coordinate. */
      const cam = window.__ENGINE.camera, e = cam.matrixWorld.elements;
      window.__ENGINE.emit('guardAlert', {
        id: 'g-offscreen', state: 'chase', level: 1,
        pos: { x: cam.position.x + e[0] * 60 + e[4] * 30,
               y: cam.position.y + e[1] * 60 + e[5] * 30,
               z: cam.position.z + e[2] * 60 + e[6] * 30 },
      });
      for (let i = 0; i < 8; i++) window.__ENGINE.renderFrame(1 / 60);
    });
    await page.waitForTimeout(600);
    const wide = await page.evaluate(PROBE, SELS);
    report.widest = wide;
    const hpW = wide['.sly-hp'];
    if (wide['.sly-obj'] && wide['.sly-obj'].exists) {
      fail('the corner objective card is still in the production DOM — §743 removed it');
    }
    console.log('\n[hudvisible] COLLISION census in the corner, every neighbour at its widest:');
    /* Every PERSISTENT element, not just the corner's own — a clearance quoted against a short
       list is a claim about that list (§442). `.sly-goal` is here because §743 kept it. */
    const NEIGH = ['.sly-tl', '.sly-coins', '.sly-threat', '.sly-carry',
      '.sly-toasts', '.sly-prompt', '.sly-goal', '.sly-pocket', '.sly-alert'];
    /* World marks are PROJECTED, and `HUD._project` CLAMPS an off-screen subject to a margin
       inset — so a guard badge or a goal pin whose subject is behind the camera parks in whatever
       corner it was heading for, and can reach any of the four. That is a property of the mark
       system, not of this corner: the objective card occupied the same rect and the same clamped
       badge landed on it. So an intersection here is REPORTED with its number rather than failed,
       and only the laid-out neighbours are a hard failure. */
    const PROJECTED = new Set(['.sly-goal', '.sly-pocket', '.sly-alert']);
    let nearest = Infinity, nearestSel = '';
    for (const s of [...NEIGH, '.sly-hp']) {
      const r = wide[s];
      if (!r || !r.exists) { console.log(`    ${s.padEnd(13)} — absent`); continue; }
      console.log(`    ${s.padEnd(13)} ${String(r.x).padStart(7)},${String(r.y).padStart(6)}  ${String(r.w).padStart(6)} x ${String(r.h).padStart(5)}   right ${String(r.right).padStart(7)} bottom ${r.bottom}`);
    }
    report.clearances = {};
    for (const s of NEIGH) {
      const r = wide[s];
      if (!r || !r.exists) continue;
      const ow = Math.min(hpW.right, r.right) - Math.max(hpW.x, r.x);
      const oh = Math.min(hpW.bottom, r.bottom) - Math.max(hpW.y, r.y);
      const area = (ow > 0 && oh > 0) ? +(ow * oh).toFixed(1) : 0;
      const gx = Math.max(r.x - hpW.right, hpW.x - r.right, 0);
      const gy = Math.max(r.y - hpW.bottom, hpW.y - r.bottom, 0);
      const gap = Math.hypot(gx, gy);
      if (gap < nearest && !PROJECTED.has(s)) { nearest = gap; nearestSel = s; }
      report.clearances[s] = { overlap: area, gap: +gap.toFixed(1), projected: PROJECTED.has(s) };
      console.log(`    ${s.padEnd(13)} overlap ${String(area).padStart(8)} px²   clearance ${gap.toFixed(1)} px${PROJECTED.has(s) ? '   (projected world mark — clamps into corners by design)' : ''}`);
      if (area > 0 && !PROJECTED.has(s)) fail(`.sly-hp INTERSECTS ${s} when everything is fully armed`);
    }
    /* The nearest LAID-OUT neighbour is the number this corner is judged on; a clamped mark is
       reported separately above and would otherwise drag the headline to zero. */
    /* The viewport margins the offsets promise. With `transform-origin: right top` the tilt can no
       longer throw the painted box past either anchored edge, which is the claim §743 re-derived
       the origin on — so it is measured rather than argued. */
    const margins = { right: +(W - hpW.right).toFixed(1), top: +hpW.y.toFixed(1) };
    report.margins = margins;
    console.log(`    viewport margins: right ${margins.right} px, top ${margins.top} px`);
    if (margins.top < 0 || margins.right < 0) fail('.sly-hp is painting outside the viewport');
    report.nearest = { sel: nearestSel, px: +nearest.toFixed(1) };
    console.log(`    nearest persistent neighbour: ${nearestSel} at ${nearest.toFixed(1)} px`);

    /* ---- 2c-bis. the Binocucom's own corner set, which exists only with the optics up ------ */
    /* §731.1 rejected the bottom-left corner because `.bx-caller` lives there and the gameplay
       cluster CROSS-DISSOLVES (0.16 s) rather than cutting. The top-right has the same shape of
       neighbour — `.bx-rec` and `.bx-corner.tr` — and §743 does not get to choose the corner, so
       this is measured and reported rather than used as a veto. Both states are read: with the
       optics down (nothing there) and up (the cluster standing down). */
    const BINOC = ['.bx-rec', '.bx-corner.tr'];
    /* THE LOOP IS RESUMED FOR THIS ARM, and that is §731.0's trap 1 rather than caution: CSS
       transitions DO NOT ADVANCE in a page whose rAF loop is stopped, so `getComputedStyle`
       returns the START of a transition. The stand-down is a 0.16 s opacity transition, so read
       with the loop stopped it reports 1 — which is what the first version of this arm reported,
       on a build whose stand-down rule is untouched. The tool still injects nothing. */
    const binocDown = await page.evaluate(PROBE, BINOC);
    await page.evaluate(() => { window.__ENGINE.resumeLoop(); });
    await page.waitForTimeout(300);
    await page.evaluate(() => { window.__ENGINE.emit('binocucom', true); });
    await page.waitForTimeout(900);
    const binocUp = await page.evaluate(PROBE, [...BINOC, '.sly-hp', '.sly-shake']);
    const binocFlag = await page.evaluate(() => document.getElementById('sly-hud')?.dataset.binoc);
    report.binoc = { down: binocDown, up: binocUp, flag: binocFlag };
    console.log('\n[hudvisible] the Binocucom neighbours in this corner (optics UP, loop running):');
    console.log(`    #sly-hud data-binoc=${binocFlag}`);
    if (binocFlag !== '1') fail(`the optics did not come up (data-binoc=${binocFlag}) — every number in this arm is about the wrong state`);
    report.binocOverlap = {};
    for (const s2 of BINOC) {
      const r = binocUp[s2];
      if (!r || !r.exists) { console.log(`    ${s2.padEnd(15)} — absent`); continue; }
      const ow = Math.min(hpW.right, r.right) - Math.max(hpW.x, r.x);
      const oh = Math.min(hpW.bottom, r.bottom) - Math.max(hpW.y, r.y);
      const area = (ow > 0 && oh > 0) ? +(ow * oh).toFixed(1) : 0;
      report.binocOverlap[s2] = area;
      console.log(`    ${s2.padEnd(15)} ${String(r.x).padStart(7)},${String(r.y).padStart(6)}  ${String(r.w).padStart(6)} x ${String(r.h).padStart(5)}   overlap with .sly-hp's rect ${area} px²`);
    }
    const hpUp = binocUp['.sly-hp'];
    console.log(`    .sly-hp with the optics up, as the running page reports it: effective opacity ${hpUp?.effectiveOpacity}  (.sly-shake computed opacity ${binocUp['.sly-shake']?.opacity})`);
    /**
     * AND THE SETTLED VALUE, read with the transition suppressed — §731.0's trap 1, which this
     * arm walked into twice before reading it. A CSS transition DOES NOT ADVANCE in this headless
     * page (resuming the rAF loop does not fix it), so `getComputedStyle` returns the START of the
     * 0.16 s stand-down and reports 1 on a build whose rule is untouched. This is the ONE place
     * this tool stages anything, it is labelled as such, and it is two-sided: the same suppressed
     * read is taken with the optics DOWN, and the two must differ or the probe proves nothing.
     */
    const settledUp = await page.evaluate(() => {
      const el = document.querySelector('.sly-shake');
      const prev = el.style.transition;
      el.style.setProperty('transition', 'none', 'important');
      void el.offsetWidth;
      const v = getComputedStyle(el).opacity;
      el.style.transition = prev;
      return v;
    });
    await page.evaluate(() => { window.__ENGINE.emit('binocucom', false); });
    await page.waitForTimeout(900);
    const settledDown = await page.evaluate(() => {
      const el = document.querySelector('.sly-shake');
      const prev = el.style.transition;
      el.style.setProperty('transition', 'none', 'important');
      void el.offsetWidth;
      const v = getComputedStyle(el).opacity;
      el.style.transition = prev;
      return v;
    });
    const hpBack = (await page.evaluate(PROBE, ['.sly-hp']))['.sly-hp'];
    console.log(`    .sly-shake SETTLED opacity (transition suppressed): optics up ${settledUp}, optics down ${settledDown}`);
    report.binocStandDown = { liveUp: hpUp?.effectiveOpacity, liveBack: hpBack?.effectiveOpacity,
                              settledUp: +settledUp, settledDown: +settledDown };
    /* CALIBRATION FIRST (§418.3): the probe must read DIFFERENT numbers in the two states, or
       "it stands down" is a constant and not a measurement. Only then is the verdict read. */
    if (!(+settledDown > 0.9)) {
      fail(`CALIBRATION FAILED — .sly-shake settles to ${settledDown} with the optics DOWN; the probe cannot discriminate the two states and its verdict is worthless`);
    } else if (!(+settledUp <= 0.02)) {
      fail(`.sly-shake settles to ${settledUp} with the optics up — .sly-hp is not standing down with the cluster`);
    } else {
      console.log('    the ornament stands down with the cluster and comes back — measured in both directions');
    }
    /* Back to a stopped loop: the grade captures below are frozen-frame measurements. */
    await page.evaluate(() => { window.__ENGINE.stopLoop(); for (let i = 0; i < 3; i++) window.__ENGINE.renderFrame(1 / 60); });
    await page.waitForTimeout(300);

    /* ---- 2d. what is behind it, at BOTH grades (§726) ------------------------------------- */
    report.grades = [];
    console.log('\n[hudvisible] background behind the badge at both L1 grades:');
    for (const [name, tod] of [['L1 day', 0.78], ['L1 night', 0.02]]) {
      await page.evaluate((t) => {
        window.__GAME.setTimeOfDay(t);
        for (let i = 0; i < 4; i++) window.__ENGINE.renderFrame(1 / 60);
      }, tod);
      await page.waitForTimeout(200);
      const png = await shoot(page, path.join(OUTDIR, `prod-${name.replace(/\W+/g, '')}.png`));
      const bg = boxStats(png, hpW);
      const bf = badgeFeatures(png, wide['.sly-hp-meter']);
      report.grades.push({ grade: name, tod, bg, greyBlobs: bf.greyBlobs, counts: bf.counts });
      console.log(`    ${name.padEnd(9)} behind+badge luma ${bg.lumaMin}..${bg.lumaMax} (mean ${bg.lumaMean}, stdev ${bg.stdev}), ${bg.colours} colours`);
      console.log(`              meter still resolves: ${bf.greyBlobs} pale-grey regions, fill ${bf.counts.fill} px, navy ${bf.counts.navy} px, grey ${bf.counts.grey} px, outline ${bf.counts.outline} px`);
      if (bf.greyBlobs < 2) fail(`at ${name} the meter resolves ${bf.greyBlobs} pale-grey regions — the eye patches are merging`);
      for (const k of ['fill', 'navy', 'grey', 'outline']) {
        if (bf.counts[k] < 6) fail(`at ${name} the meter's ${k} ink has collapsed to ${bf.counts[k]} px`);
      }
    }

    /* ---- 3. the token, on the production artifact ---------------------------------------- */
    const { page: p3 } = await boot(browser, url, '?hud=nohealth');
    const tok = await p3.evaluate(() => ({
      hp: !!document.querySelector('.sly-hp'),
      meter: document.querySelectorAll('.sly-hp-meter').length,
      /* §731.6 retired the live pip row; the corner's survivor is the coin counter. §743 retired
         the objective CARD, so the objective's survival is checked at its new home in the pause
         cel rather than at `.sly-obj`, which must be absent in this boot as in every other. */
      tl: !!document.querySelector('.sly-tl'), coins: !!document.querySelector('.sly-coins'),
      obj: !!document.querySelector('.sly-obj'),
      pobj: (document.querySelector('.sly-pobj-title')?.textContent || '').trim(),
      prompt: !!document.querySelector('.sly-prompt'),
      marks: !!document.querySelector('.sly-marks'),
      goal: !!document.querySelector('.sly-goal'),
    }));
    report.token = tok;
    console.log(`\n[hudvisible] ?hud=nohealth on the production build: ornament ${tok.hp ? 'STILL PRESENT' : 'gone'} (${tok.meter} meters); `
      + `tl ${tok.tl}, coins ${tok.coins}, prompt ${tok.prompt}, marks ${tok.marks}, goal ${tok.goal}, `
      + `corner card ${tok.obj ? 'PRESENT' : 'gone'}, pause objective "${tok.pobj}"`);
    if (tok.hp || tok.meter) fail('?hud=nohealth did not remove the ornament from the production build');
    if (!tok.tl || !tok.coins || !tok.prompt || !tok.marks || !tok.goal) fail('?hud=nohealth removed more than the ornament');
    if (tok.obj) fail('the corner objective card is present under ?hud=nohealth — §743 removed it');
    if (!tok.pobj) fail('the pause cel carries no objective text — the retained objective() API is drawing nothing');
    await p3.close();

    await writeFile(path.join(OUTDIR, 'report.json'), JSON.stringify(report, null, 2));
    console.log(`\n[hudvisible] report -> ${path.relative(ROOT, OUTDIR)}/report.json`);
    console.log(bad ? `\nVERDICT: ${bad} problem(s)` : '\nVERDICT: present, painting, and in the viewport on the production artifact');
    if (bad) process.exitCode = 1;
  } finally {
    await browser.close().catch(() => {});
    srv.close();
    release();
  }
}

run().catch((e) => { console.error(e); process.exit(1); });

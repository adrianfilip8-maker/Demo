#!/usr/bin/env node
/**
 * combatrecipient — capture harness for PREREG-combatrecipient.md.
 *
 *   node progress/records/combatrecipient.mjs <arm> [shot ...]
 *
 * ONE ARM PER BOOT. The arms are source values in `src/ai/Guard.js` (`SHOT_POSE.combat` and
 * `_poseForShot`'s restore), and the bundler reads the tree at BOOT, not at capture (§124.4).
 *
 * **This script installs and reverts the arm ITSELF, inside the held lock** — see `withArm`. It
 * has to: the FIFO queue here runs 20-60 minutes deep, so installing an arm before launching
 * would leave `src/ai/Guard.js` modified across another owner's boot and their capture would
 * silently render my candidate. `arm === 'base'` installs nothing. The revert runs from a
 * `finally`, before the lock is released, so even a crash hands the tree back clean.
 *
 * It records the tree hash it actually rendered — hashed twice, at launch AND after the boot —
 * so a mis-staged arm is detectable afterwards rather than silently scored (§121.4: hash
 * `src/**\/*.js`, not the git SHA — five owners commit concurrently and three arms of one A/B
 * once stamped different SHAs on a byte-identical tree).
 *
 * What it adds over `tools/critic.mjs`, and why:
 *
 *   TELEMETRY. After every staged shot it dumps every guard's world position/yaw/type/route/clip,
 *   the resolved camera, and which roster index `_shotLock` holds. That is free — it is a
 *   `page.evaluate`, not a frame — and it is what lets ONE captured `sly-profile` gate the
 *   residue for all five shots that stage the player at (0,0,30) (P4c/P4d).
 *
 *   READ THE HEADER OF WHAT THIS PROVES, NOT ITS USAGE (§143.1). The telemetry reads
 *   `g.position`, which is the value the mechanism under test SETS. It therefore cannot fail if
 *   the code ran: it is a PLUMBING CHECK, not a result. Every decisive gate in the prereg is a
 *   pixel gate. Where telemetry and pixels disagree, the pixels win.
 *
 * Frames land in `progress/records/combatrecipient1/<shot>-<arm>.png`, telemetry in
 * `telemetry-<arm>.json`, written INCREMENTALLY — each shot's PNG is on disk before the next is
 * staged, because the container rolls back roughly every 45 minutes (§163) and a chunk that dies
 * half way must still leave behind whatever it actually captured.
 */
import { grab, ROOT } from '../../tools/harness.mjs';
import { acquire } from '../../tools/lock.mjs';
import { chromium } from 'playwright';
import { writeFile, mkdir, readdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { readFileSync, existsSync } from 'node:fs';
import { spawn, execFileSync } from 'node:child_process';
import path from 'node:path';
import net from 'node:net';

const OUT = path.join(ROOT, 'progress', 'records', 'combatrecipient1');
const argv = process.argv.slice(2);
const ARM = argv[0];
if (!ARM) { console.error('usage: combatrecipient.mjs <arm> [shot ...]'); process.exit(2); }
const SHOTS = argv.slice(1).length ? argv.slice(1) : ['combat', 'sly-profile'];

/** sha256 of the rendered source tree. Paths are relative to ROOT deliberately: `sha256sum`
 *  hashes the path too, so an absolute path gives a different digest for a bit-identical tree. */
async function srcHash() {
  const files = [];
  const walk = async (d) => {
    for (const e of await readdir(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) await walk(p);
      else if (/\.(js|glsl\.js|mjs)$/.test(e.name)) files.push(p);
    }
  };
  await walk(path.join(ROOT, 'src'));
  files.sort();
  const h = createHash('sha256');
  for (const f of files) { h.update(path.relative(ROOT, f)); h.update(readFileSync(f)); }
  return { hash: h.digest('hex').slice(0, 16), files: files.length };
}

/* The five shots that stage the player at exactly (0,0,30) plus the one at (4,0,30), read out of
   src/core/Shots.js. P4d projects the dumped guard positions through these without capturing
   them: a guard body that misses all six viewports cannot regress any of them. */
const SPAWN_CAMS = {
  'sly-closeup': { pos: [-1.6, 1.45, 33.2], target: [0.0, 0.95, 30.0], fov: 38 },
  'sly-startle': { pos: [-2.21, 1.60, 31.78], target: [-0.08, 1.11, 30.03], fov: 22 },
  'sly-perch': { pos: [-1.6, 1.15, 33.2], target: [0.0, 0.65, 30.0], fov: 38 },
  'sly-arm': { pos: [-3.10, 1.45, 28.21], target: [0.0, 0.95, 30.0], fov: 38 },
  'sly-profile': { pos: [2.21, 1.70, 33.13], target: [0.0, 0.88, 30.0], fov: 38 },
  'sly-key': { pos: [2.4, 1.45, 33.2], target: [4.0, 0.95, 30.0], fov: 38 },
};

/* Screen bbox of an upright 2r x h x 2r box, and whether it OVERLAPS the viewport.
   Not "is a corner inside the viewport": a body that straddles the whole frame has every
   corner outside it, which reported `sly-startle` — where the residue fills the frame — as
   safe while I was writing the prereg. */
function bodyBox(cam, stand, h = 1.95, r = 0.42, W = 1280, H = 720) {
  const [px, py, pz] = cam.pos, [tx, ty, tz] = cam.target;
  const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
  const nrm = (v) => { const l = Math.hypot(...v); return [v[0] / l, v[1] / l, v[2] / l]; };
  const crs = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  const back = nrm(sub([px, py, pz], [tx, ty, tz]));
  let right = crs([0, 1, 0], back);
  right = dot(right, right) < 1e-12 ? [1, 0, 0] : nrm(right);
  const up = crs(back, right);
  const t = Math.tan((cam.fov * Math.PI / 180) * 0.5), aspect = W / H;
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity, d0 = Infinity, d1 = -Infinity, ok = false;
  for (const dx of [-r, r]) for (const dz of [-r, r]) for (const dy of [0, h]) {
    const w = [stand[0] + dx, stand[1] + dy, stand[2] + dz];
    const v = sub(w, [px, py, pz]);
    const depth = -dot(v, back);
    if (depth <= 1e-6) continue;
    ok = true;
    const sx = (dot(v, right) / (t * aspect * depth) + 1) * 0.5 * W;
    const sy = (1 - dot(v, up) / (t * depth)) * 0.5 * H;
    x0 = Math.min(x0, sx); x1 = Math.max(x1, sx);
    y0 = Math.min(y0, sy); y1 = Math.max(y1, sy);
    d0 = Math.min(d0, depth); d1 = Math.max(d1, depth);
  }
  if (!ok) return { behind: true, overlaps: false };
  return {
    behind: false, x0: +x0.toFixed(1), x1: +x1.toFixed(1), y0: +y0.toFixed(1), y1: +y1.toFixed(1),
    d0: +d0.toFixed(2), d1: +d1.toFixed(2), overlaps: x1 > 0 && x0 < W && y1 > 0 && y0 < H,
  };
}

const ANCHOR = [0.3146, 1.3849, 28.9963];   // Particles._stageShot()'s hardcoded impact point
const STAND = [0.102, 0.0, 29.035];         // the predicted screenSide:+1 recipient stand

/* ==========================================================================================
   Locked boot — why this exists instead of `withGame`.

   `withGame` acquires the FIFO lock as its FIRST action and boots Vite immediately after. That
   is right for a capture that does not touch source, but every arm of this A/B IS a source
   edit, and the queue here routinely runs 20-60 minutes deep. Installing an arm before
   launching would leave `src/ai/Guard.js` modified across somebody else's boot — the tree is
   shared, the bundler reads it at boot (§124.4), and their capture would silently render my
   candidate. That is the worst kind of failure: invisible, in another owner's result.

   So the ordering is inverted and made explicit:

       acquire lock -> install arm -> boot vite -> capture -> revert arm -> release lock

   `installArm` / `revertArm` shell out to `combatrecipient-arms.py`, which refuses to build on a
   non-base tree and whose revert asserts the file back to base's sha256. The revert also runs
   from a `finally`, so a crash mid-capture still hands the tree back clean.

   The Vite env and the Chrome flags below are copied verbatim from `tools/harness.mjs` so these
   frames are the same frames every other capture in this project produces. If that file's boot
   changes, this must be re-synced — stated as the maintenance cost of not using it.
   ========================================================================================== */
const ARMS_PY = path.join(ROOT, 'progress', 'records', 'combatrecipient-arms.py');
const CHROME_CANDIDATES = ['/opt/pw-browsers/chromium', '/usr/bin/chromium', '/usr/bin/chromium-browser'];
const CHROME_ARGS = [
  '--no-sandbox', '--disable-dev-shm-usage', '--use-gl=angle', '--use-angle=swiftshader',
  '--enable-unsafe-swiftshader', '--enable-webgl', '--ignore-gpu-blocklist',
  '--disable-frame-rate-limit', '--js-flags=--max-old-space-size=4096',
  '--force-device-scale-factor=1', '--hide-scrollbars', '--mute-audio',
];

function armsPy(...args) {
  return execFileSync('python3', [ARMS_PY, ...args], { cwd: ROOT, encoding: 'utf8' }).trim();
}

async function freePort(start = 5700) {
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
  if (!existsSync(bin)) throw new Error('vite not installed');
  const proc = spawn(bin, ['--port', String(port), '--strictPort', '--host', '127.0.0.1'], {
    cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, NO_COLOR: '1', SANDS_NO_HMR: '1' },
  });
  let log = '';
  proc.stdout.on('data', (d) => { log += d; });
  proc.stderr.on('data', (d) => { log += d; });
  for (let i = 0; i < 160; i++) {
    if (proc.exitCode !== null) throw new Error(`vite exited (${proc.exitCode}):\n${log}`);
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

/** acquire -> install -> boot -> fn -> revert -> release. `arm === 'base'` installs nothing.
 *
 *  Records two hashes for the drift check (see the boot-side comment): the tree as it stood when
 *  the lock was finally granted, BEFORE this arm was installed, and again immediately AFTER the
 *  install. Both are needed because the runner is itself a writer to `src/`, so "the tree moved"
 *  is ambiguous until its own edit is accounted for. */
async function withArm(arm, fn, marks = {}) {
  const release = await acquire({
    onWait: (ms, pid) => process.stdout.write(
      `· waiting for capture lock (${(ms / 1000) | 0}s, held by pid ${pid})\n`),
  });
  let installed = false;
  let server = null, browser = null;
  try {
    marks.atLock = (await srcHash()).hash;
    if (arm !== 'base') {
      process.stdout.write(`· lock held — installing arm "${arm}" into src/ai/Guard.js\n`);
      process.stdout.write(`  ${armsPy('install', arm)}\n`);
      installed = true;
    }
    marks.postInstall = (await srcHash()).hash;
    const port = await freePort();
    server = await startServer(port);
    const executablePath = process.env.CHROME_PATH || CHROME_CANDIDATES.find((p) => existsSync(p));
    browser = await chromium.launch({ executablePath, args: CHROME_ARGS });
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
    const page = await ctx.newPage();
    const consoleErrors = [];
    page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text()); });
    page.on('pageerror', (e) => consoleErrors.push(`pageerror: ${e.message}`));
    await page.goto(`http://127.0.0.1:${port}/?shot=1&q=high`,
      { waitUntil: 'domcontentloaded', timeout: 90000 });
    await page.waitForFunction('window.__GAME && window.__GAME.ready === true', null,
      { timeout: 300000, polling: 500 });
    const info = await page.evaluate(() => ({
      shots: window.__GAME.shots, modules: window.__GAME.modules(),
      warnings: window.__GAME.warnings.slice(),
      renderer: (() => {
        const gl = window.__ENGINE?.renderer?.getContext?.();
        const d = gl?.getExtension('WEBGL_debug_renderer_info');
        return d ? gl.getParameter(d.UNMASKED_RENDERER_WEBGL) : 'unknown';
      })(),
    }));
    info.consoleErrors = consoleErrors;
    return await fn({ page, info });
  } finally {
    await browser?.close().catch(() => {});
    server?.kill('SIGTERM');
    setTimeout(() => server?.kill('SIGKILL'), 3000);
    /* Revert BEFORE releasing, always — including on a crash. A released lock with a dirty tree
       is the contamination this whole function exists to prevent. */
    if (installed) {
      try { process.stdout.write(`  ${armsPy('revert')}\n`); }
      catch (e) { process.stdout.write(`!! REVERT FAILED: ${e?.message || e}\n`); }
    }
    try { process.stdout.write(`  tree: ${armsPy('check').split('\n')[0]}\n`); } catch { /* ignore */ }
    release();
  }
}

async function dumpGuards(page) {
  return page.evaluate(() => {
    const e = window.__ENGINE;
    const G = e?.get?.('guards');
    const cam = e?.camera;
    const out = { guards: [], lock: null, cam: null, warnings: (window.__GAME?.warnings || []).length };
    if (cam) {
      cam.updateMatrixWorld(true);
      const p = cam.position;
      out.cam = { pos: [p.x, p.y, p.z], fov: cam.fov, aspect: cam.aspect };
    }
    if (!G?.list) return out;
    out.lock = G._shotLock ? G.list.indexOf(G._shotLock) : -1;
    out.shot = G._shot ?? null;
    /* GuardAnim stores the clip OBJECT, not its name, so recover the name by identity —
       reading back "which clip is frozen" is the only way to confirm SHOT_POSE.clip took. */
    const clipName = (anim) => {
      if (!anim?.clip || !anim.clips) return null;
      for (const k of Object.keys(anim.clips)) if (anim.clips[k] === anim.clip) return k;
      return null;
    };
    for (let i = 0; i < G.list.length; i++) {
      const g = G.list[i];
      out.guards.push({
        i, type: g.type, name: g.name,
        pos: [+g.position.x.toFixed(4), +g.position.y.toFixed(4), +g.position.z.toFixed(4)],
        yaw: +g.yaw.toFixed(4), u: +(g.u ?? 0).toFixed(4), state: g.state,
        clip: clipName(g.anim),
        frozen: !!g.anim?._frozen, animT: +(g.anim?.time ?? 0).toFixed(4),
        visible: !!g.root?.visible,
      });
    }
    return out;
  });
}

function analyse(dump) {
  const a = { minDistToAnchor: null, minDistToStand: null, lockPos: null, spawnHits: {} };
  if (!dump.guards?.length) return a;
  let mA = Infinity, mS = Infinity;
  for (const g of dump.guards) {
    mA = Math.min(mA, Math.hypot(g.pos[0] - ANCHOR[0], g.pos[2] - ANCHOR[2]));
    mS = Math.min(mS, Math.hypot(g.pos[0] - STAND[0], g.pos[2] - STAND[2]));
  }
  a.minDistToAnchor = +mA.toFixed(4);
  a.minDistToStand = +mS.toFixed(4);
  if (dump.lock >= 0) a.lockPos = dump.guards[dump.lock]?.pos ?? null;
  // P4d: project EVERY guard through the six spawn cameras.
  for (const [name, cam] of Object.entries(SPAWN_CAMS)) {
    const hits = [];
    for (const g of dump.guards) {
      const h = TUNE_HEAD[g.type] ?? 1.95, r = TUNE_RAD[g.type] ?? 0.42;
      const b = bodyBox(cam, g.pos, h, r);
      if (b.overlaps) hits.push({ i: g.i, type: g.type, pos: g.pos, box: b });
    }
    a.spawnHits[name] = hits;
  }
  return a;
}
const TUNE_HEAD = { temple: 1.95, heavy: 2.22, scarab: 0.34 };
const TUNE_RAD = { temple: 0.42, heavy: 0.56, scarab: 0.26 };

async function main() {
  await mkdir(OUT, { recursive: true });
  const tree = await srcHash();
  process.stdout.write(`· arm "${ARM}"  srcTree ${tree.hash} (${tree.files} files)  shots: ${SHOTS.join(', ')}\n`);

  const telemetry = {
    arm: ARM, at: new Date().toISOString(), srcTree: tree.hash, srcFiles: tree.files,
    order: SHOTS, shots: {},
  };
  const flush = () => writeFile(path.join(OUT, `telemetry-${ARM}.json`),
    JSON.stringify(telemetry, null, 2));

  const marks = {};
  await withArm(ARM, async ({ page, info }) => {
    /* Re-hash the tree AFTER the boot, not only before the lock wait. The launch-time hash is
       taken minutes (sometimes an hour) before `withGame` acquires the FIFO lock and Vite reads
       the tree, so on its own it is a number that does not depend on the thing it claims to
       measure — the DIGEST's recurring defect.

       CORRECTED (§191): comparing the boot hash to the LAUNCH hash voided every candidate arm by
       construction, because this runner is itself a writer to `src/` — it installs its own arm
       between those two hashes. `base` never exposed it (base installs nothing), so the check
       looked healthy until the first candidate ran and reported VOID for doing exactly what it
       was told to do. "The tree moved" is ambiguous until the runner's own edit is accounted for,
       so the two questions are now asked separately against the marks `withArm` records:

         fifoDrift   atLock !== launch      another owner changed src during the queue wait.
                                            THIS is the original hazard, and it is fatal: the
                                            arm would render a different base than the one the
                                            `base` arm was captured on, confounding every A/B.
         bootDrift   boot !== postInstall   src changed between the install and the boot.

       `srcStable` is the conjunction of both being clean, and only that voids the arm. The
       installed delta between `atLock` and `postInstall` is this runner's own work and is
       expected — it is reported, never counted as drift. */
    const boot = await srcHash();
    telemetry.srcTreeAtBoot = boot.hash;
    telemetry.srcTreeAtLock = marks.atLock;
    telemetry.srcTreePostInstall = marks.postInstall;
    const fifoDrift = marks.atLock !== tree.hash;
    const bootDrift = boot.hash !== marks.postInstall;
    telemetry.fifoDrift = fifoDrift;
    telemetry.bootDrift = bootDrift;
    telemetry.srcStable = !fifoDrift && !bootDrift;
    if (fifoDrift) {
      process.stdout.write(`!! TREE MOVED DURING THE FIFO WAIT — launch ${tree.hash} -> atLock `
        + `${marks.atLock}. Another owner changed src/ while this arm queued; it would render a `
        + 'different base than the `base` arm did. VOID.\n');
    }
    if (bootDrift) {
      process.stdout.write(`!! TREE MOVED BETWEEN INSTALL AND BOOT — postInstall `
        + `${marks.postInstall} -> boot ${boot.hash}. VOID.\n`);
    }
    if (telemetry.srcStable) {
      process.stdout.write(`· srcStable OK — launch ${tree.hash} == atLock; boot == postInstall `
        + `${marks.postInstall}${ARM === 'base' ? '' : ' (own arm install accounted for)'}\n`);
    }
    telemetry.renderer = info.renderer;
    telemetry.bootWarnings = info.warnings;
    telemetry.consoleErrors = info.consoleErrors;
    telemetry.modules = info.modules;
    await flush();

    for (const name of SHOTS) {
      const t0 = Date.now();
      const r = await grab(page, name);
      const png = path.join(OUT, `${name}-${ARM}.png`);
      await writeFile(png, Buffer.from(r.dataUrl.split(',')[1], 'base64'));
      /* The PNG is already on disk. Telemetry must never be able to cost a captured frame or
         the shot that would have followed it — a diagnostic that kills the run destroys the
         evidence (Debug.js's own rule, §5). */
      let dump = { error: null }, derived = { error: null };
      try { dump = await dumpGuards(page); } catch (err) { dump = { error: String(err?.message || err) }; }
      try { derived = analyse(dump); } catch (err) { derived = { error: String(err?.message || err) }; }
      telemetry.shots[name] = {
        secs: +((Date.now() - t0) / 1000).toFixed(1),
        stats: r.stats, warnings: r.warnings,
        guards: dump, derived,
      };
      await flush();                                   // incremental: survive a rollback
      const d = telemetry.shots[name].derived;
      const hits = d.spawnHits
        ? Object.entries(d.spawnHits).filter(([, v]) => v.length).map(([k, v]) => `${k}:${v.length}`).join(',') || 'none'
        : 'n/a';
      process.stdout.write(
        `  OK ${name}  ${telemetry.shots[name].secs}s  lock=${dump.lock}`
        + `  minDist(anchor)=${d.minDistToAnchor}  minDist(stand)=${d.minDistToStand}`
        + `  spawnHits=${hits}\n`);
    }
  }, marks);

  await flush();
  process.stdout.write(`DONE arm=${ARM} srcTree=${tree.hash} srcStable=${telemetry.srcStable}\n`);
}

main().catch((e) => { console.error('FAILED:', e?.stack || e); process.exit(1); });

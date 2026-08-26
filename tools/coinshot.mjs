#!/usr/bin/env node
/**
 * coinshot.mjs — frames of the COIN, on a camera aimed by the coin's own geometry.
 *
 * §712's evidence tool. The canonical shots in `src/core/Shots.js` are a fixed contract and none
 * of them is close enough to a coin to read its face, so this adds an ad-hoc camera without
 * touching that file: `setShot` stages the world (time of day, sun, player), `engine.debug.freeCam`
 * is already true afterwards, and the camera is then placed from the live scene.
 *
 * ── The camera is DERIVED from the coin, which is the whole point ────────────────────────────
 * A collectible coin here stands upright and spins a full turn about Y (`Pickups._writeCoinMatrices`
 * poses it `Euler(π/2, 0, θ)`, which — measured, not read off the Euler — leaves its face normal
 * horizontal at every θ and sweeps it round the XZ circle). So at any given instant the face
 * points somewhere specific, and a camera at a hand-typed position photographs whatever the
 * spin happened to be doing: on a bad draw, the edge.
 *
 * That is exactly the failure the `camDot` pre-flight exists to catch, and a tool on this project
 * "spent its whole life labelling rear shots front". So this does not guess. It reads the coin's
 * instance matrix out of the live `InstancedMesh`, extracts the face normal, and puts the camera
 * ON that normal — then reports the dot product it achieved, so a frame that came out edge-on
 * says so in its own output instead of being argued about afterwards.
 *
 *   node tools/coinshot.mjs                       both frames, 1280x720
 *   node tools/coinshot.mjs --coin 45 --dist 0.9  a different coin, closer
 *   node tools/coinshot.mjs --out shots/coin-before
 *   node tools/coinshot.mjs --tree /path/to/worktree --out shots/coin-before
 *
 * `--tree` serves the frames from a DIFFERENT checkout — a `git worktree` at the commit before a
 * change — so a before/after pair is the same tool, the same camera derivation and the same coin
 * index against two builds. The tree needs a `node_modules` (symlinking the main one is enough).
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

const TREE = path.resolve(opt('tree', ROOT));   // which checkout vite serves
const OUTDIR = path.resolve(ROOT, opt('out', 'shots/coin'));
const W = +opt('w', 1280), H = +opt('h', 720);
const COIN = +opt('coin', 45);          // index into Pickups.coins — see tools/coinfit.mjs
const DIST = +opt('dist', 1.05);        // metres from the coin, along its own face normal
const STAGE = opt('stage', 'courtyard');// which canonical shot stages the world
const TIMEOUT = +opt('timeout', 600) * 1000;

function sha() {
  try { return execFileSync('git', ['rev-parse', '--short', 'HEAD'], { cwd: TREE }).toString().trim(); }
  catch { return '(no git)'; }
}

async function freePort(start = 5400) {
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
  const bin = path.join(TREE, 'node_modules', '.bin', 'vite');
  if (!existsSync(bin)) throw new Error(`vite not installed in ${TREE} — symlink node_modules into the worktree`);
  const proc = spawn(bin, ['--port', String(port), '--strictPort', '--host', '127.0.0.1'], {
    cwd: TREE, stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, NO_COLOR: '1', SANDS_NO_HMR: '1' },
  });
  let log = '';
  proc.stdout.on('data', (d) => { log += d; });
  proc.stderr.on('data', (d) => { log += d; });
  const deadline = Date.now() + 60000;
  while (Date.now() < deadline) {
    if (/localhost:\d+|ready in/i.test(log)) break;
    if (proc.exitCode !== null) throw new Error(`vite exited (${proc.exitCode}):\n${log}`);
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
  throw new Error(`vite never listened on ${port}:\n${log}`);
}

/* ------------------------------------------------------------------ main */

await mkdir(OUTDIR, { recursive: true });
process.stdout.write(`· coinshot @ ${sha()} · serving ${TREE} → ${path.relative(ROOT, OUTDIR)}\n`);
const release = await acquire({ onWait: (ms) => process.stdout.write(`· waiting for the capture lock (${(ms / 1000) | 0}s)\n`) });
let server = null, browser = null;
try {
  const port = await freePort();
  server = await startServer(port);
  browser = await chromium.launch({
    executablePath: process.env.CHROME_PATH || undefined,
    args: ['--no-sandbox', '--disable-dev-shm-usage', '--use-gl=angle', '--use-angle=swiftshader',
      '--enable-unsafe-swiftshader', '--enable-webgl', '--ignore-gpu-blocklist',
      '--disable-frame-rate-limit', '--js-flags=--max-old-space-size=4096',
      '--force-device-scale-factor=1', '--hide-scrollbars'],
  });
  const page = await browser.newPage({ viewport: { width: W, height: H } });
  page.on('pageerror', (e) => process.stdout.write(`  [page] ${e.message}\n`));
  await page.goto(`http://127.0.0.1:${port}/`, { waitUntil: 'domcontentloaded', timeout: 120000 });
  await page.waitForFunction('window.__GAME && window.__GAME.ready === true', null, { timeout: 300000 });

  /* 1. Stage the world, then capture the canonical frame unchanged — the in-level view, at real
        placement, on a camera nobody in this lane chose. */
  const level = await Promise.race([
    page.evaluate(async (s) => {
      const r = await window.__GAME.setShot(s, { dt: 0 });
      return { png: window.__GAME.capture(), stats: r.stats };
    }, STAGE),
    new Promise((_, rj) => setTimeout(() => rj(new Error('stage timed out')), TIMEOUT)),
  ]);
  await writeFile(path.join(OUTDIR, `level-${STAGE}.png`), Buffer.from(level.png.split(',')[1], 'base64'));
  process.stdout.write(`  ✓ level-${STAGE}.png\n`);

  /* 2. The close-up, aimed by the coin's own face normal. */
  const close = await Promise.race([
    page.evaluate(async ({ idx, dist }) => {
      const G = window.__GAME, E = G.engine, T = G.THREE;
      const pk = E.get('pickups');
      if (!pk?._coinMesh) return { error: 'no pickup_coins mesh in the scene' };
      const mesh = pk._coinMesh;
      if (idx >= mesh.count) return { error: `coin ${idx} of ${mesh.count}` };
      mesh.updateMatrixWorld(true);
      const m = new T.Matrix4();
      mesh.getMatrixAt(idx, m);
      m.premultiply(mesh.matrixWorld);
      const pos = new T.Vector3().setFromMatrixPosition(m);
      /* The coin's local +Y is its face; a cylinder's axis is +Y and the caps are its faces. */
      const nrm = new T.Vector3(0, 1, 0).transformDirection(m).normalize();
      /* Stand off along the face normal, lifted a little so the frame is not dead-on flat. */
      const eye = pos.clone().addScaledVector(nrm, dist).add(new T.Vector3(0, 0.10, 0));
      E.camera.position.copy(eye);
      E.camera.lookAt(pos);
      E.camera.updateMatrixWorld(true);
      /* The pre-flight, reported rather than assumed: how face-on did we actually end up, and
         is anything between the camera and the coin. */
      const toCam = eye.clone().sub(pos).normalize();
      const dot = Math.abs(nrm.dot(toCam));
      /* `Raycaster` does NOT honour `object.visible` — it tests layers and geometry and nothing
         else — so this walk up the parents is load-bearing rather than defensive. `Props` keeps a
         decorative TWIN of the coin set at the same 44 spots and `Pickups` hides it; without this
         filter the pre-flight reports the subject's own invisible double as a blocker 0.98 m in
         front of it, on every single close-up, and the one instrument that is supposed to catch a
         bad frame cries wolf on the good ones. (Same family as bottlefit's note that `Raycaster`
         DOES honour `material.side`: this class does what it does, and it is worth checking which.) */
      const shown = (o) => { for (let p = o; p; p = p.parent) if (p.visible === false) return false; return true; };
      const ray = new T.Raycaster(eye, pos.clone().sub(eye).normalize(), 0.01, dist * 0.98);
      const hits = ray.intersectObject(E.scene, true).filter((h) => h.object !== mesh && shown(h.object));
      await G.step(6, 0);
      return {
        png: G.capture(),
        coin: [pos.x, pos.y, pos.z], eye: [eye.x, eye.y, eye.z], normal: [nrm.x, nrm.y, nrm.z],
        dot, blockers: hits.slice(0, 3).map((h) => `${h.object.name || h.object.type}@${h.distance.toFixed(2)}m`),
        count: mesh.count,
      };
    }, { idx: COIN, dist: DIST }),
    new Promise((_, rj) => setTimeout(() => rj(new Error('close-up timed out')), TIMEOUT)),
  ]);
  if (close.error) throw new Error(close.error);
  await writeFile(path.join(OUTDIR, 'coin-face.png'), Buffer.from(close.png.split(',')[1], 'base64'));
  process.stdout.write(`  ✓ coin-face.png\n`);
  process.stdout.write(`    coin #${COIN} of ${close.count} at (${close.coin.map((n) => n.toFixed(2)).join(', ')})\n`);
  process.stdout.write(`    camera at (${close.eye.map((n) => n.toFixed(2)).join(', ')}), ${DIST} m along the face normal ` +
    `(${close.normal.map((n) => n.toFixed(2)).join(', ')})\n`);
  process.stdout.write(`    PRE-FLIGHT  |n·toCam| = ${close.dot.toFixed(3)}  ` +
    `(1.000 = dead face-on, 0.000 = edge-on — a frame under ~0.85 is not a face)\n`);
  process.stdout.write(`    PRE-FLIGHT  blockers between camera and coin: ` +
    `${close.blockers.length ? close.blockers.join(', ') : 'none'}\n`);
} finally {
  await browser?.close().catch(() => {});
  server?.kill('SIGTERM');
  release();
}
process.exit(0);

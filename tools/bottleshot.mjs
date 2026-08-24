#!/usr/bin/env node
/**
 * bottleshot.mjs — photograph the clue bottle, before and after the asset substitution.
 *
 * Two claims, two frames each (§466.5):
 *
 *   READ   close enough to resolve glass, cork and label as three separate things. Two different
 *          bottles at two different heights and times of day, so the reading is not a property of
 *          one lighting accident.
 *   PLACED the same object at the distance a PLAYER meets it, standing in its authored spot.
 *          A close-up proves the mesh arrived; it says nothing about whether the thing still
 *          reads as a pickup from where you actually see it, which is the question the twelve
 *          placements exist to answer.
 *
 * ── Cameras are derived from the SPOT, never from the live mesh ──────────────────────────────
 * The bottle bobs, and after the import it also sways ±0.0618 m. Aiming at wherever the instance
 * happens to be would give the before and after run two different cameras, and a before/after
 * pair shot from two cameras compares nothing. So every camera below is computed from the static
 * placement literal in `Props._clueBottles()`, identical in both trees.
 *
 * ── The frame is checked for its subject, not trusted by its name (§604 and worse) ───────────
 * A tool in this repository spent its entire life labelling rear shots "front". So each capture
 * also reports where the bottle's live instance actually projected to in NDC and how many pixels
 * of the frame it covers — a name is a label, and the projection is evidence. `camDot` runs first
 * as the standing pre-flight against cameras standing inside something.
 *
 *   node tools/bottleshot.mjs                    every frame
 *   node tools/bottleshot.mjs read-summit        just that one
 *   OUT=shots/bottle-before node tools/bottleshot.mjs
 */
import { chromium } from 'playwright';
import { acquire } from './lock.mjs';
import { camDot } from './camdot.mjs';
import { measureInPage, reportDraw, NAMES } from './bottledraw.mjs';
import { spawn } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import net from 'node:net';

const ROOT = path.resolve(import.meta.dirname, '..');
const W = +(process.env.W || 1280), H = +(process.env.H || 720), Q = process.env.Q || 'high';
const OUTDIR = path.join(ROOT, process.env.OUT || 'shots/bottle');

/**
 * `spot` is the bottle's authored placement, copied from `Props._clueBottles()`'s literal — the
 * camera is offset from it, so both trees photograph the same point in the world.
 */
const FRAMES = {
  /* ---- READ: can you tell the three materials apart ---- */

  /* The pylon summit deck, the highest bottle in the level: nothing behind it but sky, which is
     the cleanest background any of the twelve has and therefore the fairest test of whether the
     glass, the neck and the label separate at all. */
  'read-summit': {
    spot: [0.0, 35.0, -52.0], eye: [1.05, 0.45, 0.65], aim: [0, 0.22, 0], fov: 30, tod: 0.62,
  },
  /* The terrace's first bottle, 32 m lower, against warm stone instead of sky and at a different
     time of day. If the label only reads against sky it does not read. */
  'read-terrace': {
    spot: [-2.2, 3.0, 17.5], eye: [1.05, 0.45, 0.65], aim: [0, 0.22, 0], fov: 30, tod: 0.34,
  },

  /* ---- PLACED: what the player actually sees ---- */

  /* Terrace stage 1 — §8.1 step 1, the first bottle on the route, from roughly where you come up
     onto the terrace. ~4.9 m, 50° — a player's distance, not a portrait lens. */
  /* Eye at +1.6 rather than +1.0 on a measured basis, not on taste: at +1.0 camDot puts a surface
     0.384 m off the lens, which is inside §601's 0.48 m failure. +1.6 takes the near field to
     1.129 m and moves the subject only 0.13 m further away. */
  'placed-terrace': {
    spot: [-2.2, 3.0, 17.5], eye: [3.4, 1.6, 3.5], aim: [0, 0.2, 0], fov: 50, tod: 0.34,
  },
  /* Nave deck — the rooftop run, 18 m up. The second sample deliberately differs in every way
     that could flatter the first: height, surroundings, sun angle and approach bearing. */
  'placed-nave': {
    spot: [0.0, 18.0, -34.0], eye: [3.6, 0.9, 3.5], aim: [0, 0.2, 0], fov: 50, tod: 0.62,
  },
};

const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const argv = process.argv.slice(2);
const want = argv.length ? argv : Object.keys(FRAMES);

async function preflight(names) {
  if (process.env.CAMDOT === '0') { process.stdout.write('· camDot skipped (CAMDOT=0)\n'); return names; }
  const ok = [];
  for (const n of names) {
    const f = FRAMES[n];
    if (!f) { ok.push(n); continue; }
    const r = await camDot(add(f.spot, f.eye), add(f.spot, f.aim));
    if (r.ok) {
      process.stdout.write(`· camDot ${n.padEnd(15)} ok    nearest ${r.nearest} m, subject ${r.targetLen} m, first hit ${r.forward} m\n`);
      ok.push(n);
    } else {
      process.stdout.write(`· camDot ${n.padEnd(15)} REFUSE\n    - ${r.reasons.join('\n    - ')}\n`);
    }
  }
  if (!ok.length) { process.stdout.write('\nEvery requested camera was refused; nothing to shoot.\n'); process.exit(1); }
  return ok;
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
  if (!existsSync(bin)) throw new Error('vite not installed');
  const proc = spawn(bin, ['--port', String(port), '--strictPort', '--host', '127.0.0.1'], {
    cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, NO_COLOR: '1', SANDS_NO_HMR: '1' },
  });
  let log = '';
  proc.stdout.on('data', (d) => { log += d; });
  proc.stderr.on('data', (d) => { log += d; });
  for (let i = 0; i < 240; i++) {
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

async function main() {
  await mkdir(OUTDIR, { recursive: true });
  const shoot = await preflight(want);
  const release = await acquire({
    onWait: (ms, pid) => process.stdout.write(`· waiting for capture lock (${(ms / 1000) | 0}s, pid ${pid})\n`),
  });
  process.on('exit', release);
  const port = await freePort();
  const server = await startServer(port);
  const CHROME = process.env.CHROME_PATH
    || ['/opt/pw-browsers/chromium', '/usr/bin/chromium', '/usr/bin/chromium-browser'].find((p) => existsSync(p));
  const browser = await chromium.launch({
    executablePath: CHROME,
    args: ['--no-sandbox', '--disable-dev-shm-usage', '--use-gl=angle', '--use-angle=swiftshader',
      '--enable-unsafe-swiftshader', '--enable-webgl', '--ignore-gpu-blocklist',
      '--disable-frame-rate-limit', '--js-flags=--max-old-space-size=4096',
      '--force-device-scale-factor=1', '--hide-scrollbars', '--mute-audio'],
  });
  try {
    const ctx = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
    const page = await ctx.newPage();
    const consoleErrors = [];
    page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text()); });
    page.on('pageerror', (e) => consoleErrors.push(`pageerror: ${e.message}`));
    process.stdout.write('· loading game\n');
    await page.goto(`http://127.0.0.1:${port}/?shot=1&q=${Q}`, { waitUntil: 'domcontentloaded', timeout: 90000 });
    await page.waitForFunction('window.__GAME && window.__GAME.ready === true', null, { timeout: 900000, polling: 500 });
    process.stdout.write('· ready\n');
    /* Stage on a canonical shot — that is what stops the rAF loop, turns on freeCam and hides
       the HUD. Which one does not matter; every camera below is hand-aimed after it. */
    await page.evaluate(() => window.__GAME.setShot('courtyard'));
    /* A throwaway frame pays for the shader warm-up, which otherwise lands on frame one. */
    await page.evaluate(async () => { await window.__GAME.step(12, 1 / 60); window.__GAME.capture(); });

    for (const name of shoot) {
      const f = FRAMES[name];
      if (!f) { process.stdout.write(`  ? unknown frame ${name}\n`); continue; }
      const t0 = Date.now();
      const res = await page.evaluate(async (F) => {
        const g = window.__GAME, e = g.engine;
        const A = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
        const pos = A(F.spot, F.eye), look = A(F.spot, F.aim);
        const ch = e.get('character');
        if (ch?.root) ch.root.visible = false;
        const aim = () => {
          e.camera.fov = F.fov;
          e.camera.position.set(...pos);
          e.camera.up.set(0, 1, 0);
          e.camera.lookAt(...look);
          e.camera.updateProjectionMatrix();
          e.camera.updateMatrixWorld(true);
        };
        g.setTimeOfDay(F.tod);
        aim();
        await g.step(8, 1 / 60);
        aim();

        /* ---- where the bottle ACTUALLY is, and where it lands in the frame ---- */
        let probe = null;
        const mesh = e.scene.getObjectByName('pickup_clues');
        if (mesh?.isInstancedMesh) {
          const m = new mesh.matrixWorld.constructor();
          let best = null;
          for (let i = 0; i < mesh.count; i++) {
            mesh.getMatrixAt(i, m);
            const p = [m.elements[12], m.elements[13], m.elements[14]];
            const d = Math.hypot(p[0] - F.spot[0], p[1] - F.spot[1], p[2] - F.spot[2]);
            if (!best || d < best.d) best = { d, p, i };
          }
          if (best) {
            /* Project through the same camera that is about to take the picture. */
            const v = new e.camera.position.constructor(best.p[0], best.p[1], best.p[2]);
            v.project(e.camera);
            probe = {
              instance: best.i,
              world: best.p.map((n) => +n.toFixed(3)),
              driftFromSpot: +best.d.toFixed(3),
              ndc: [+v.x.toFixed(3), +v.y.toFixed(3), +v.z.toFixed(3)],
              inFrame: Math.abs(v.x) <= 1 && Math.abs(v.y) <= 1 && v.z > -1 && v.z < 1,
              camDist: +Math.hypot(best.p[0] - pos[0], best.p[1] - pos[1], best.p[2] - pos[2]).toFixed(3),
              material: mesh.material?.name || mesh.material?.type,
              vertexColors: !!mesh.material?.vertexColors,
              tris: (mesh.geometry?.index?.count ?? 0) / 3,
            };
          }
        }
        return { png: g.capture(), probe, pos, look };
      }, f);

      const file = path.join(OUTDIR, `${name}.png`);
      await writeFile(file, Buffer.from(res.png.split(',')[1], 'base64'));
      const p = res.probe;
      process.stdout.write(`  ${name.padEnd(15)} ${((Date.now() - t0) / 1000).toFixed(0)}s  → ${path.relative(ROOT, file)}\n`);
      if (!p) process.stdout.write('      !! no `pickup_clues` mesh in the scene — this frame has no subject\n');
      else {
        process.stdout.write(`      bottle #${p.instance} at ${JSON.stringify(p.world)}  ${p.driftFromSpot} m off its spot (bob+sway)\n`);
        process.stdout.write(`      ${p.camDist} m from the lens, NDC ${JSON.stringify(p.ndc)}  ` +
          `${p.inFrame ? 'IN FRAME' : '!! OUTSIDE THE FRAME — this picture does not contain the bottle'}\n`);
        process.stdout.write(`      material ${p.material}  vertexColors ${p.vertexColors}  ${p.tris} tris\n`);
      }
    }
    /* The draw-call measurement rides along in this boot rather than taking the capture lock a
       second time — on this container a lock acquisition has cost twenty minutes of queueing
       behind another lane, and both tools were asking about the same twelve meshes. Run LAST so
       nothing it does to `visible` can reach a frame; it restores every flag it touches, and its
       own restore-check would say so if it did not. */
    process.stdout.write('\n· draw-call measurement (same boot)\n');
    const draw = await page.evaluate(measureInPage, NAMES);
    reportDraw(draw);

    if (consoleErrors.length) process.stdout.write(`\nconsole errors:\n  ${consoleErrors.join('\n  ')}\n`);
  } finally {
    await browser.close().catch(() => {});
    server.kill('SIGTERM');
    setTimeout(() => server.kill('SIGKILL'), 3000);
    release();
  }
}

main().catch((e) => { console.error(e); process.exit(1); });

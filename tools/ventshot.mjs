#!/usr/bin/env node
/**
 * ventshot.mjs — photograph the §600 vent passage from cameras that are NOT in `Shots.js`.
 *
 * `shot.mjs` can only render names in the canonical `SHOTS` table, and adding four entries there
 * would lengthen the critic's default set for everyone to look at one lane's tunnel. `__GAME`
 * exposes `engine`, `step` and `capture`, and `setShot` is what puts the renderer into capture
 * mode (rAF stopped, `freeCam` on, HUD hidden), so: stage on the nearest canonical shot, then
 * drive the camera and the staged player by hand and grab the frame.
 *
 *   node tools/ventshot.mjs                  all frames, 1280x720, quality high
 *   node tools/ventshot.mjs mouth gallery    just those
 *   W=1600 H=900 node tools/ventshot.mjs
 *
 * Takes the same FIFO capture lock as `shot.mjs`. Two frames is ~5 minutes of exclusive hold on
 * this container's software rasteriser; keep runs short.
 */
import { chromium } from 'playwright';
import { acquire } from './lock.mjs';
import { camDot } from './camdot.mjs';
import { spawn } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import net from 'node:net';

const ROOT = path.resolve(import.meta.dirname, '..');
const W = +(process.env.W || 1280), H = +(process.env.H || 720), Q = process.env.Q || 'high';
const OUTDIR = path.join(ROOT, process.env.OUT || 'shots/vent');

/** [name, camera pos, look-at, fov, time of day, staged player pos + yaw + pose] */
const FRAMES = {
  /* 1. The mouth, from inside the hall. The thing the player meets: a hole cut in the paving at
        the north wall's base with a ramp running down under the wall, where §565 left a bricked-up
        panel. This camera is MEASURED, and it took two wrong ones to get here (§601).

        The obvious camera stands in the hall's middle and is blocked: KayKit's north-west crate
        pile at x -21.4..-19.0, z -47.3..-44.5 fills 29 of 45 view rays. `_moveset.mjs`'s
        `realWorld()` does not boot KAYKIT, so a ray census of the drawn scene calls that camera
        CLEAR; `_kaykitboot.mjs` shows the crates.

        The fix for that was to re-aim WEST — and then re-run only the PROP census, which came
        back clean (1 ray of 45) at a camera standing 0.8 m off the hall's own west wall. That
        frame shipped nothing: half of it was a flat pale slab 0.48 m from the lens. Fixing one
        occluder and re-measuring only that occluder is how a check stays true by accident.

        So this camera is chosen by a sweep over 160 candidates scoring both at once — aperture
        reachability AND near-field distance — against the drawn scene with props booted:

          floor 20/20 sample points on the ramp reachable   (west camera 6/20, middle camera 0/20)
          nearest hit 1.71 m                                (west camera 0.48 m)
          12 of 45 view rays pass through the mouth
          composition: 20/45 hieroglyph wall, 13/45 paving, 12/45 sandstone — 0 props, 0 sky

        `fill 12/45` is as much of the frame as the entrance can occupy from any admissible
        camera: it is a 1.70 x 2.50 m hole in a floor. That is the subject, not a fault. */
  mouth: {
    pos: [-21.85, 2.60, -47.40], look: [-21.85, -1.20, -50.70], fov: 55, tod: 0.62,
    /* No staged subject. The character root does not track the controller once `setShot` has
       staged it, so whatever is written here renders at THIS camera — and at 6 m the frozen
       `crawl` pose came out as an unlit faceted mass filling the whole frame, three takes
       running. These frames are about the passage; the subject is R1/R3's driven capsule. */
    player: null,
  },
  /* §603. The two cue frames, and they are deliberately NOT staged cameras.
     Every other frame in this table is hand-aimed at a height and angle chosen to show the
     geometry well. That is the right lens for "is the interior authored" and the wrong one for
     "would a player notice this", which is the question §603 exists to answer — §601 is the
     standing reminder that a camera picked to flatter a subject can measure clean and still say
     nothing about the thing being asked.

     Both sit on the WALKING LINE at EYE HEIGHT: y 1.60, the same eye the visibility census uses,
     at the gameplay field of view (`CameraRig` drives 75), looking north the way a player walks.
     Comparable to the census numbers by construction, and to nothing else.

     `eye-approach` is the bore's own axis at 6 m. `eye-address` is x -21.0 — the centre of the
     opening §565 framed and §600 deleted — the line a player who remembers a vent in this wall
     actually walks.

     Both stand 6 m back, and for `eye-address` that is a correction. At 3 m it is INSIDE KayKit's
     north-west crate pile (x -21.4..-19.0, z -47.3..-44.5) and the frame came back as a flat
     blue-grey field filling four fifths of it: the inside of a crate. §603's own visibility census
     marks that stance "eye INSIDE the KayKit crate pile" one row above where this camera was put,
     so it was not unknown — a camera was sited without reading the measurement already taken of
     that exact line. On x -21.0 only 1 m and 5 m or more are clear of the pile. */
  'eye-approach': {
    pos: [-21.50, 1.60, -42.70], look: [-21.50, 0.15, -49.60], fov: 75, tod: 0.62, player: null,
  },
  'eye-address': {
    pos: [-21.00, 1.60, -42.70], look: [-21.00, 0.35, -49.70], fov: 75, tod: 0.62, player: null,
  },
  /* 1b. The SECOND sample of the same claim, from the other side of the wall: standing inside
         the portal looking back south into the hall, so the doorway reads as a cut through
         2.1 m of masonry with the hall's own light at the end of it. */
  mouthback: {
    pos: [-21.85, -1.35, -52.4], look: [-21.85, 0.30, -46.0], fov: 60, tod: 0.62,
    player: null,
  },
  /* 2. Inside the shaft, looking down it — the 24 m of interior §565 priced and declined. */
  shaft: {
    pos: [-21.85, -1.15, -51.0], look: [-21.85, -4.6, -61.4], fov: 62, tod: 0.62,
    player: null,
  },
  /* 3. The east run, looking back west up the tunnel from just inside the crypt portal. */
  run: {
    pos: [-13.0, -4.75, -63.0], look: [-22.4, -4.90, -63.0], fov: 60, tod: 0.62,
    player: null,
  },
  /* 4. The arrival. From the crypt floor, looking up at the gallery, the portal and the stair. */
  gallery: {
    pos: [-4.6, -8.6, -66.6], look: [-11.6, -5.6, -64.6], fov: 55, tod: 0.62,
    player: null,
  },
  /* 5. The vantage, which is the reason the arrival is worth reaching: standing ON the gallery,
        looking down the burial chamber at the sarcophagus past the granite piers. This is
        `ventroute` R4's sightline with a lens on it — the eye is the same 1.55 m over the ledge
        the arm searches from. */
  vantage: {
    pos: [-11.30, -3.85, -66.8], look: [0.55, -9.40, -71.70], fov: 62, tod: 0.62,
    player: null,
  },

  /* ── §605 the hook rings, turned to stand vertical and face along the path ─────────────────
     The acceptance test for a LOOK request is the pair, not either frame: a ring standing
     vertical and facing the path must read as a CIRCLE from the approach and as a THIN VERTICAL
     PROFILE from the side. Either one alone is satisfiable by the wrong geometry — a flat hoop
     photographed from directly above also reads as a circle, and a flat hoop photographed from
     its own level also reads as a thin line. Only the pair, from two cameras 90 deg apart on the
     same rings, separates "vertical, facing the path" from "flat".

     Cameras are ON the chain's own axis rather than hand-aimed. `ring-approach` stands 4.9 m
     behind ring 1 along that ring's own facing and looks down the line, which is the sightline
     a swinging player has. `ring-side` stands 14 m off the chain's mean bearing at the same
     height band, which is the sightline a player on the ground has. */
  ringapproach: {
    pos: [16.98, 14.94, 23.17], look: [1.00, 14.50, -3.00], fov: 50, tod: 0.30,
    player: null,
  },
  ringside: {
    pos: [15.47, 16.80, -3.82], look: [4.20, 14.80, 4.50], fov: 55, tod: 0.30,
    player: null,
  },
  /* The nave chain is the same claim with the jitter removed — these five rings draw no rng at
     all, so their facing is exactly the path tangent and nothing blurs the reading. */
  naveapproach: {
    pos: [1.30, 6.86, -16.60], look: [-2.00, 6.60, -40.80], fov: 45, tod: 0.42,
    player: null,
  },
  naveside: {
    pos: [12.60, 7.90, -33.00], look: [-2.00, 6.65, -33.90], fov: 50, tod: 0.42,
    player: null,
  },
};

const argv = process.argv.slice(2);
const want = argv.length ? argv : Object.keys(FRAMES);

/**
 * §604 — the pre-flight. Two frames in this project have been shot from cameras that could not
 * see their subject, and a browser boot plus a software render is 2-8 minutes to find that out.
 * `camDot` builds the level in Node WITH props and answers it in seconds, so a bad camera never
 * reaches the queue. `CAMDOT=0` skips it for the case where a frame INTENDS to be inside
 * something — nothing here does, but a guard with no override gets deleted rather than argued with.
 */
async function preflight(names) {
  if (process.env.CAMDOT === '0') { process.stdout.write('· camDot skipped (CAMDOT=0)\n'); return names; }
  const ok = [];
  for (const n of names) {
    const f = FRAMES[n];
    if (!f) { ok.push(n); continue; }
    const r = await camDot(f.pos, f.look);
    if (r.ok) {
      process.stdout.write(`· camDot ${n.padEnd(13)} ok    nearest ${r.nearest} m, subject ${r.targetLen} m, first hit ${r.forward} m\n`);
      ok.push(n);
    } else {
      process.stdout.write(`· camDot ${n.padEnd(13)} REFUSE\n    - ${r.reasons.join('\n    - ')}\n`);
    }
  }
  if (!ok.length) { process.stdout.write('\nEvery requested camera was refused; nothing to shoot.\n'); process.exit(1); }
  return ok;
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
  const bin = path.join(ROOT, 'node_modules', '.bin', 'vite');
  if (!existsSync(bin)) throw new Error('vite not installed');
  const proc = spawn(bin, ['--port', String(port), '--strictPort', '--host', '127.0.0.1'], {
    cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'],
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

async function main() {
  await mkdir(OUTDIR, { recursive: true });
  const shoot = await preflight(want);
  const release = await acquire({
    onWait: (ms, pid) => process.stdout.write(`· waiting for capture lock (${(ms / 1000) | 0}s, pid ${pid})\n`),
  });
  process.on('exit', release);
  const port = await freePort();
  const server = await startServer(port);
  /* Same pinned binary and the same flags `shot.mjs` uses: this container has no GPU, and
     Playwright's own bundled revision is not the one that is installed. */
  const CHROME = process.env.CHROME_PATH
    || ['/opt/pw-browsers/chromium', '/usr/bin/chromium', '/usr/bin/chromium-browser'].find((p) => existsSync(p));
  const browser = await chromium.launch({
    executablePath: CHROME,
    args: ['--no-sandbox', '--disable-dev-shm-usage', '--use-gl=angle', '--use-angle=swiftshader',
      '--enable-unsafe-swiftshader', '--enable-webgl', '--ignore-gpu-blocklist',
      '--disable-frame-rate-limit', '--js-flags=--max-old-space-size=4096',
      '--force-device-scale-factor=1', '--hide-scrollbars', '--mute-audio'],
  });
  const report = { at: new Date().toISOString(), width: W, height: H, quality: Q, frames: {}, errors: [] };
  try {
    const ctx = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
    const page = await ctx.newPage();
    const consoleErrors = [];
    page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text()); });
    page.on('pageerror', (e) => consoleErrors.push(`pageerror: ${e.message}`));
    process.stdout.write('· loading game\n');
    await page.goto(`http://127.0.0.1:${port}/?shot=1&q=${Q}`, { waitUntil: 'domcontentloaded', timeout: 90000 });
    await page.waitForFunction('window.__GAME && window.__GAME.ready === true', null, { timeout: 600000, polling: 500 });
    process.stdout.write('· ready\n');
    /* Stage once on the tomb's own canonical shot: that is what stops the rAF loop, turns on
       freeCam, hides the HUD and freezes a pose. Everything after this is hand-aimed. */
    await page.evaluate(() => window.__GAME.setShot('interior'));
    /* A throwaway frame before the first real one. The first capture of a boot came back a flat
       blue field: it costs the whole shader-program warm-up (417 s against 31-108 s for the
       three after it) and the three settle steps below are not enough to pay for it. */
    await page.evaluate(async () => { await window.__GAME.step(12, 1 / 60); window.__GAME.capture(); });

    for (const name of shoot) {
      const f = FRAMES[name];
      if (!f) { process.stdout.write(`  ? unknown frame ${name}\n`); continue; }
      const t0 = Date.now();
      try {
        const png = await Promise.race([
          page.evaluate(async (F) => {
            const g = window.__GAME, e = g.engine;
            const ch = e.get('character');
            if (ch?.root) {
              if (F.player) {
                ch.root.position.set(...F.player.pos);
                ch.root.rotation.set(0, F.player.yaw, 0);
                ch.root.visible = true;
                try { e.get('animation')?.freezePose?.(F.player.pose); } catch { /* pose may not exist */ }
              } else {
                ch.root.visible = false;
              }
            }
            g.setTimeOfDay(F.tod);
            e.camera.fov = F.fov;
            e.camera.position.set(...F.pos);
            e.camera.up.set(0, 1, 0);
            e.camera.lookAt(...F.look);
            e.camera.updateProjectionMatrix();
            e.camera.updateMatrixWorld(true);
            await g.step(8, 1 / 60);
            e.camera.fov = F.fov;
            e.camera.position.set(...F.pos);
            e.camera.lookAt(...F.look);
            e.camera.updateProjectionMatrix();
            e.camera.updateMatrixWorld(true);
            return g.capture();
          }, f),
          new Promise((_, rej) => setTimeout(() => rej(new Error('timed out after 600s')), 600000)),
        ]);
        const file = path.join(OUTDIR, `${name}.png`);
        await writeFile(file, Buffer.from(png.split(',')[1], 'base64'));
        report.frames[name] = { file: path.relative(ROOT, file), ms: Date.now() - t0 };
        process.stdout.write(`  ✓ ${name.padEnd(10)} ${String(Date.now() - t0).padStart(6)}ms\n`);
      } catch (err) {
        report.errors.push(`${name}: ${err.message}`);
        process.stdout.write(`  ✗ ${name}: ${err.message.split('\n')[0]}\n`);
      }
      await writeFile(path.join(OUTDIR, 'report.json'), JSON.stringify(report, null, 2)).catch(() => {});
    }
    report.consoleErrors = consoleErrors.slice(0, 20);
  } finally {
    await browser.close().catch(() => {});
    server.kill('SIGTERM');
    setTimeout(() => server.kill('SIGKILL'), 3000);
    await writeFile(path.join(OUTDIR, 'report.json'), JSON.stringify(report, null, 2)).catch(() => {});
  }
  process.stdout.write(`\n→ ${path.relative(ROOT, OUTDIR)}/  (${Object.keys(report.frames).length} frames)\n`);
  process.exit(0);
}

main().catch((e) => { console.error('ventshot failed:', e.message); process.exit(1); });

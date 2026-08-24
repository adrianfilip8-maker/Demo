#!/usr/bin/env node
/**
 * guardground.mjs — photograph the guards standing (or not standing) on the ground.
 *
 * The numeric case is in `guardfloat`/`guardstand`/`guardlift`; this is the picture, and it is
 * built so the before and after frames are comparable rather than merely adjacent:
 *
 *  · **The same camera in both arms.** Every camera below is a fixed `pos`/`look`/`fov` triple.
 *    Nothing is re-solved per arm, so a guard that moves between the two frames moved because
 *    the guard moved.
 *
 *  · **The guards WALK to where they are photographed** (§435.4). No guard is placed. The tool
 *    drives the shipped `Guards.update` path for `SETTLE` seconds of world time before the
 *    shutter, with the player parked far outside the level so nobody is chasing and every route
 *    is walked as a patrol. That is also what makes the arms comparable: the same number of the
 *    same updates in both.
 *
 *  · **Every camera goes through the `camDot` pre-flight** (§604), which builds the level in
 *    Node with props booted and refuses a lens that is inside something or aimed through
 *    something. A frame whose camera was refused is never taken, so a bad frame cannot be
 *    mislabelled as evidence about guards.
 *
 *  · **The frames are named for what they contain, not for what they were meant to show.** A
 *    tool in this repo spent its life labelling rear shots "front". Each entry states the
 *    subject guard's route and the coordinates the camera is looking at, and the report records
 *    where each subject actually was when the shutter fired — so the file name is checkable
 *    against the frame rather than trusted.
 *
 * ── Which of the four guard-ground tools to reach for ─────────────────────────────────────
 * They measure different quantities; none is a superset of another.
 *   `guardfloat`  the GAP, per guard, along the whole route — distribution, not one number.
 *                 Two independent instruments (collision BVH vs. a raycast of the RENDERED
 *                 scene) so "the collider disagrees with the picture" is separable.
 *   `guardstand`  ONE guard's surroundings: the radius sweep that shows the answer moving with
 *                 the probe, the neighbourhood grid, and the named colliders within 2 m.
 *   `guardlift`   the single FRAME a guard leaves the floor. `guardfloat` samples twice a
 *                 second and the lift is one frame wide, so it cannot see it (§440: sampling
 *                 is an instrument too).
 *   `guardground` the frames.
 *
 * Two of `guardfloat`'s own readings were wrong before they were right, and both faults were in
 * the instrument rather than the subject — see its header. Read a number from any of these
 * against the control rows it prints, not on its own.
 *
 *   node tools/guardground.mjs                    all frames
 *   node tools/guardground.mjs wide-colonnade close-pylon
 *   OUT=shots/guardground-before node tools/guardground.mjs
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
const OUTDIR = path.join(ROOT, process.env.OUT || 'shots/guardground');
/** Seconds of world time the garrison walks before the shutter. Identical in both arms. */
const SETTLE = +(process.env.SETTLE || 60);
/** Where the player is parked. Far outside the level, so every guard stays on patrol. */
const PARK = [600, 0, 600];

/**
 * [name] = camera pos, look-at, fov, time of day, and the guards the frame is about.
 *
 * The subjects are the two the measurement moved:
 *   guard1  temple, `courtyard_ring`, stalls by the west colonnade at x -18.4, z ~22.3.
 *           Pre-fix he stands 1.32 m over the paving; post-fix 0.03 m.
 *   guard4  temple, `pylon_gate`, stalls in front of the pylon at x -4.9, z 31.5.
 *           Pre-fix 1.95 m over the paving; post-fix 0.05 m.
 * The third, guard8 in the tomb (pre -9.90, post -12.00, a 2.1 m drop), has no camera: every
 * bearing round him is either a tomb wall within 0.35 m of the lens or a crate stack across
 * his feet, and the two that were clear could not also contain his pre-fix stand. He is in the
 * numbers and not in the pictures, which is stated rather than quietly dropped.
 */
const FRAMES = {
  /* Every camera here was CHOSEN by sweep against the built level, not typed, and the
     requirement was harder than "points at a guard": the subject must be unoccluded, his FEET
     must be visible, and BOTH arms must be fully inside the frame — the pre-fix stand is
     1.3-2.0 m higher than the post-fix one, so a lens framed on a fixed guard crops the
     floating one and reads as if he simply were not there. The closes are framed to a solved
     rule — centre 1.8 m above the post-fix feet, half-height 2.4 m at the subject distance —
     which is the tightest framing that holds a 4 m vertical span with the soles clear of the
     bottom edge.

     ── A BOUND, stated because the brief asked for something the level will not give ──
     There is NO camera in this temple that frames two guards with both sets of feet visible.
     Forty-odd candidates were put through `camDot` — courtyard, terrace, hall nave, tomb, from
     3 m to 16 m up — and every one either had architecture between the lens and one of the two
     (the west colonnade stands between guard1 and guard4; the hall's papyrus columns stand
     between guard5 and guard6) or buried the lens in a wall. `wide-colonnade` below does hold
     both guard1 and guard4, but guard4 lands at 77 px behind the colonnade with his feet
     occluded, so he is IN the frame without being legible EVIDENCE in it. The honest form of
     "several at once" for this defect is therefore the nine-guard table `guardfloat` prints
     and the settle report this tool writes, not one photograph. Refused candidates, kept as
     the record of what the pre-flight is for:
       [-11.5, 6.4, 6.5]   SUBJECT OCCLUDED — arch:court:sandstone_block at 16.05 m of 20.66
       [-31, 5, 30.5]      SUBJECT OCCLUDED — arch:court:mudbrick at 4.73 m of 22.63
       [-14.4, 2.0, 19.4]  SUBJECT OCCLUDED — props_bronze at 4.02 m of 4.81
       [6, 3.0, -22]       BURIED — nearest surface 0.15 m
       [9, 3.5, -28]       FACING A WALL — column_papyrus at 0.76 m
     The last two are the hall, where guard5 and guard6 stand 13.9 m apart with four column
     rows between them. */

  /* ---- WIDE: the subject in his surroundings, from two different stances (§466.5) ------ */
  'wide-colonnade': {
    pos: [-24, 5, 24], look: [-18.44, 1.13, 22.0], fov: 65, tod: 0.78,
    about: ['guard1 temple/courtyard_ring'],
    also: ['guard4 temple/pylon_gate — in frame at ~77 px, feet occluded by the colonnade; not evidence'],
    note: 'north-east across the west colonnade at 6.2 m; guard1 ~135 px, near-field clutter 44%',
  },
  'wide-open': {
    pos: [-22, 3.5, 27], look: [-18.46, 1.05, 22.32], fov: 75, tod: 0.78,
    about: ['guard1 temple/courtyard_ring'],
    note: 'a 75 deg lens from lower and further north — a different stance, not a re-crop; guard1 ~137 px',
  },

  /* ---- CLOSE: the sole against the paving, on two DIFFERENT guards -------------------- */
  'close-colonnade': {
    pos: [-18.44, 3.00, 28.5], look: [-18.46, 1.05, 22.32], fov: 45, tod: 0.78,
    about: ['guard1 temple/courtyard_ring'],
    note: 'down the colonnade from the north at 6.2 m — the side the brazier is NOT on. post ~258 px, pre ~250 px, feet clear',
  },
  'close-pylon': {
    pos: [-1.0, 1.90, 27.6], look: [-4.93, 1.80, 31.5], fov: 50, tod: 0.78,
    about: ['guard4 temple/pylon_gate'],
    note: 'from the south-east at 5.7 m, the one bearing where the crate stack does not hide his boots. post ~280 px, pre ~295 px',
  },
};

const want = process.argv.slice(2).filter((a) => !a.startsWith('-'));
const shoot = want.length ? want : Object.keys(FRAMES);

/* ---------------------------------------------------------------------------------------- */
/* §604 pre-flight — before a browser is launched                                            */
/* ---------------------------------------------------------------------------------------- */
const ok = [];
const report0 = {};
if (process.env.CAMDOT === '0') {
  process.stdout.write('! CAMDOT=0 — pre-flight SKIPPED, frames are unvetted\n');
  ok.push(...shoot.filter((n) => FRAMES[n]));
} else {
  process.stdout.write('· camDot pre-flight\n');
  for (const name of shoot) {
    const f = FRAMES[name];
    if (!f) { process.stdout.write(`  ? unknown frame ${name}\n`); continue; }
    let d = null;
    try { d = await camDot(f.pos, f.look); } catch (e) { process.stdout.write(`  ! ${name}: camDot threw ${e.message}\n`); }
    if (!d) { ok.push(name); continue; }
    process.stdout.write(`  ${d.ok ? '✓' : '✗'} ${name.padEnd(16)} ${d.ok ? 'clear' : 'REFUSED'}  `
      + `enclosed ${d.near}/${d.dirs}  nearest ${d.nearest}  forward ${d.forward} (${d.forwardName})  `
      + `target ${d.targetLen}  subject ${d.subjectBlocked ? 'BLOCKED' : 'clear'}\n`);
    report0[name] = d;
    if (!d.ok) { for (const r of d.reasons) process.stdout.write(`      ${r}\n`); continue; }
    ok.push(name);
  }
}
if (!ok.length) { process.stdout.write('\nEvery requested camera was refused; nothing to shoot.\n'); process.exit(1); }

/* ---------------------------------------------------------------------------------------- */
async function freePort(start = 5600) {
  for (let p = start; p < start + 300; p++) {
    const free = await new Promise((res) => {
      const s = net.createServer();
      s.once('error', () => res(false));
      s.once('listening', () => s.close(() => res(true)));
      s.listen(p, '127.0.0.1');
    });
    if (free) return p;
  }
  throw new Error('no free port');
}

const release = await acquire({ onWait: (ms, pid) => process.stdout.write(`· waiting for capture lock (${(ms / 1000) | 0}s, pid ${pid})\n`) });
await mkdir(OUTDIR, { recursive: true });
const report = { settleSeconds: SETTLE, park: PARK, frames: {}, subjects: {}, errors: [], camdot: process.env.CAMDOT === '0' ? 'skipped' : report0 };
let server = null, browser = null;
try {
  const port = await freePort();
  const bin = path.join(ROOT, 'node_modules', '.bin', 'vite');
  if (!existsSync(bin)) throw new Error('vite not installed');
  server = spawn(bin, ['--port', String(port), '--strictPort', '--host', '127.0.0.1'],
    { cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, NO_COLOR: '1', SANDS_NO_HMR: '1' } });
  let vlog = '';
  server.stdout.on('data', (d) => { vlog += d; });
  server.stderr.on('data', (d) => { vlog += d; });
  for (let i = 0; i < 200; i++) {
    if (server.exitCode !== null) throw new Error(`vite exited:\n${vlog}`);
    const up = await new Promise((res) => {
      const s = net.connect(port, '127.0.0.1');
      s.once('connect', () => { res(true); s.destroy(); });
      s.once('error', () => res(false));
      s.setTimeout(2000, () => { res(false); s.destroy(); });
    });
    if (up) break;
    await new Promise((r) => setTimeout(r, 250));
  }

  const CHROME = ['/opt/pw-browsers/chromium', '/usr/bin/chromium', '/usr/bin/chromium-browser'];
  browser = await chromium.launch({
    executablePath: process.env.CHROME_PATH || CHROME.find((p) => existsSync(p)),
    args: ['--no-sandbox', '--disable-dev-shm-usage', '--use-gl=angle', '--use-angle=swiftshader',
      '--enable-unsafe-swiftshader', '--enable-webgl', '--ignore-gpu-blocklist',
      '--disable-frame-rate-limit', '--js-flags=--max-old-space-size=4096',
      '--force-device-scale-factor=1', '--hide-scrollbars', '--mute-audio'],
  });
  const ctx = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  const consoleErrors = [];
  page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text()); });
  page.on('pageerror', (e) => consoleErrors.push(`pageerror: ${e.message}`));
  page.setDefaultTimeout(0);

  process.stdout.write('· loading game\n');
  await page.goto(`http://127.0.0.1:${port}/?shot=1&q=${Q}`, { waitUntil: 'domcontentloaded', timeout: 90000 });
  await page.waitForFunction('window.__GAME && window.__GAME.ready === true', null, { timeout: 900000, polling: 500 });
  process.stdout.write('· ready — staging\n');

  /* `setShot` is what stops the rAF loop, turns on freeCam and hides the HUD. Everything after
     is hand-aimed. `courtyard` is used only for that; its camera is overwritten per frame. */
  await page.evaluate(() => window.__GAME.setShot('courtyard'));
  /* Throwaway frame: the first capture of a boot pays the whole shader warm-up. */
  await page.evaluate(async () => { await window.__GAME.step(10, 1 / 60); window.__GAME.capture(); });

  /* ---- settle the garrison, once, before any frame ------------------------------------ */
  process.stdout.write(`· walking the garrison ${SETTLE}s (player parked at ${PARK})\n`);
  const settled = await page.evaluate(async ([secs, park]) => {
    const e = window.__ENGINE, guards = e.get('guards'), mv = e.get('movement');
    if (mv?.position) mv.position.set(park[0], park[1], park[2]);
    /* A shot lock holds a guard in a staged pose and stops him patrolling; `courtyard` sets
       none, but clearing is cheap and makes the arms identical whatever the shot table says. */
    if (guards?._shotLocks) guards._shotLocks.length = 0;
    const dt = 1 / 60;
    let t = 0;
    for (let f = 0; f < Math.round(secs / dt); f++) { t += dt; guards.update(dt, t); }
    return guards.guards.map((g) => ({
      id: g.id, type: g.type, route: g.route.name,
      pos: [+g.position.x.toFixed(3), +g.position.y.toFixed(4), +g.position.z.toFixed(3)],
      u: +g.u.toFixed(4), speed: +g.speed.toFixed(3), state: g.state,
    }));
  }, [SETTLE, PARK]);
  report.subjects = settled;
  for (const s of settled) process.stdout.write(`    ${s.id.padEnd(7)} ${s.route.padEnd(15)} y ${String(s.pos[1]).padStart(9)}  at (${s.pos[0]}, ${s.pos[2]})  u ${s.u}\n`);

  for (const name of ok) {
    const f = FRAMES[name];
    const t0 = Date.now();
    try {
      const png = await page.evaluate(async (F) => {
        const g = window.__GAME, e = g.engine;
        /* Sly is not the subject and his idle is another lane's live work; keep him out. */
        const ch = e.get('character');
        if (ch?.root) ch.root.visible = false;
        g.setTimeOfDay(F.tod);
        const aim = () => {
          e.camera.fov = F.fov;
          e.camera.position.set(...F.pos);
          e.camera.up.set(0, 1, 0);
          e.camera.lookAt(...F.look);
          e.camera.updateProjectionMatrix();
          e.camera.updateMatrixWorld(true);
        };
        aim();
        /* dt = 0: the frames advance, the world clock does not, so the garrison stands exactly
           where the settle left it and every frame in this run is of the same instant. */
        await g.step(8, 0);
        aim();
        return g.capture();
      }, f);
      /* Where each guard actually landed on THIS frame, in pixels. The point is that the
         file name becomes checkable: a frame called `close-pylon` that reports guard4 at
         12 px in a corner is mislabelled, and the report says so without anyone opening it. */
      const boxes = await page.evaluate(async (F) => {
        const e = window.__ENGINE, guards = e.get('guards'), cam = e.camera;
        const out = {};
        for (const g of guards.guards) {
          const p = g.position;
          const proj = (y) => {
            const v = { x: p.x, y, z: p.z };
            const t = new cam.position.constructor(v.x, v.y, v.z).project(cam);
            return [Math.round((t.x * 0.5 + 0.5) * F.W), Math.round((-t.y * 0.5 + 0.5) * F.H), t.z];
          };
          const f = proj(p.y), h = proj(p.y + 2.02);
          const on = (q) => q[2] < 1 && q[0] >= 0 && q[0] < F.W && q[1] >= 0 && q[1] < F.H;
          out[g.id] = { feetPx: [f[0], f[1]], headPx: [h[0], h[1]], heightPx: Math.abs(h[1] - f[1]),
                        inFrame: on(f) && on(h) };
        }
        return out;
      }, { W, H });
      const file = path.join(OUTDIR, `${name}.png`);
      await writeFile(file, Buffer.from(png.split(',')[1], 'base64'));
      report.frames[name] = { file: path.relative(ROOT, file), ms: Date.now() - t0, pos: f.pos,
        look: f.look, fov: f.fov, about: f.about, also: f.also, note: f.note, projected: boxes };
      const inf = Object.entries(boxes).filter(([, b]) => b.inFrame)
        .map(([k, b]) => `${k}@${b.feetPx[0]},${b.feetPx[1]} ${b.heightPx}px`).join('  ');
      process.stdout.write(`  ✓ ${name.padEnd(16)} ${String(Date.now() - t0).padStart(6)}ms   in frame: ${inf || 'NOBODY'}\n`);
    } catch (err) {
      report.errors.push(`${name}: ${err.message}`);
      process.stdout.write(`  ✗ ${name}: ${err.message.split('\n')[0]}\n`);
    }
    await writeFile(path.join(OUTDIR, 'report.json'), JSON.stringify(report, null, 2)).catch(() => {});
  }
  report.consoleErrors = consoleErrors.slice(0, 20);
  await writeFile(path.join(OUTDIR, 'report.json'), JSON.stringify(report, null, 2));
} finally {
  await browser?.close().catch(() => {});
  server?.kill('SIGTERM');
  setTimeout(() => server?.kill('SIGKILL'), 3000);
  release();
}
process.stdout.write(`\nframes -> ${path.relative(ROOT, OUTDIR)}\n`);

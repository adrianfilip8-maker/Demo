#!/usr/bin/env node
/**
 * torchpick.mjs — §734's DECISION instrument: the two downloaded torch candidates photographed
 * on the SAME wall, in the SAME light, beside the SAME procedural sconces they would replace.
 *
 * The owner asked whether a downloaded asset can replace the generated wall torches. Two
 * candidates existed and the brief was explicit that the choice must be made by LOOKING, not by
 * filename or file size:
 *
 *   A  public/assets/kaykit/torch_mounted.gltf   391 v / 278 tri, on the §729 dungeon atlas
 *   B  public/assets/tombchaser/Torch_Art.glb    205 v / 116 tri, own embedded texture, CC0
 *
 * The rig interleaves them along the hypostyle hall's +x wall, which already carries five
 * procedural torches at `Props.L.hallZ` = -50/-42/-34/-26/-18, y 4.2, ry -PI/2. The candidates
 * go at the MIDPOINTS -46 / -38 / -30, so one frame holds
 *
 *      gen(-50) B(-46) gen(-42) A(-38) gen(-34) B(-30) gen(-26)
 *
 * — every art style on the same masonry at the same range under the same key. Nothing is moved
 * or hidden, so this cannot flatter a candidate by giving it a cleaner backdrop than the thing
 * it is being compared against.
 *
 * Both candidates are seated the way the SHIPPED swap would seat them (that is the point — a
 * render of a differently-seated body decides nothing about the body that ships):
 *   - conformed by uniform scale to the generated sconce's own measured union height, the §729
 *     conform, never a typed number;
 *   - the arm turned to face +Z in model space before the mount rotation (A already reaches
 *     along +Z, B reaches along +X and takes a -90 deg pre-roll);
 *   - re-seated so the back plate lands ON the wall plane at z = 0 local, undoing the XZ
 *     re-centring `KayKit.loadModelLib` performs — that re-centring is correct for a barrel
 *     standing on a floor and WRONG for a plate that has to meet a vertical surface.
 *
 * Captured at both grades. Torches are a night feature above all, so the night pass is the one
 * that decides; the day pass is the second sample §466.5 requires.
 *
 * TO RE-RUN AFTER THE DECISION: candidate B is served out of `public/assets/tombchaser/`, and
 * that directory is staged for this comparison only — the losing candidate does not ship, so it
 * is removed from `public/` once the verdict is recorded, and B's request here will 404.
 * `cp staging/assets/tombchaser/{Torch_Art.glb,LICENSE.txt,PROVENANCE.md} public/assets/tombchaser/`
 * puts it back. The pack itself is never deleted; only its copy under the served root is.
 *
 *   node tools/torchpick.mjs                 both grades into shots/torch734/
 *   node tools/torchpick.mjs --out DIR
 */
import { chromium } from 'playwright';
import { acquire } from './lock.mjs';
import { spawn, execFileSync } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import net from 'node:net';

/* The bare `chromium.launch()` this file first shipped burned a 13-minute wait in the capture
   queue and then failed: playwright resolves to `chrome-headless_shell-1234`, which is not the
   build installed here (1194). Every working capture tool in this directory passes an explicit
   executablePath and the swiftshader argv — there is no GPU in this container — so this one
   does too, copied from celshot.mjs rather than reinvented. */
const CHROME = ['/opt/pw-browsers/chromium', '/usr/bin/chromium', '/usr/bin/chromium-browser'];
const ARGS = ['--no-sandbox', '--disable-dev-shm-usage', '--use-gl=angle', '--use-angle=swiftshader',
  '--enable-unsafe-swiftshader', '--enable-webgl', '--ignore-gpu-blocklist', '--hide-scrollbars',
  '--force-device-scale-factor=1', '--js-flags=--max-old-space-size=4096'];

const ROOT = path.resolve(import.meta.dirname, '..');
const argv = process.argv.slice(2);
const opt = (n, d) => { const i = argv.indexOf(`--${n}`); if (i < 0) return d; const v = argv[i + 1]; argv.splice(i, 2); return v; };
const OUTDIR = path.resolve(ROOT, opt('out', 'shots/torch734'));
const W = +opt('w', 1280), H = +opt('h', 720);

function sha() {
  try { return execFileSync('git', ['rev-parse', '--short', 'HEAD'], { cwd: ROOT }).toString().trim(); }
  catch { return '(no git)'; }
}

async function freePort(start = 5610) {
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
  if (!existsSync(bin)) throw new Error(`vite not installed in ${ROOT}`);
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

/* The rig, run inside the page. Returns the measured seating of each candidate so the picture
   comes with the numbers that produced it rather than a claim about them. */
/* An IIFE, not a bare arrow: `page.evaluate(string)` evaluates the string as an EXPRESSION and
   hands back whatever it evaluates to. A bare `async () => {…}` therefore returns the function
   object rather than running it, and the first run of this file died on `undefined.genH`. */
const RIG = `
(async () => {
  const THREE = window.__THREE;
  const E = window.__ENGINE;
  const { GLTFLoader } = await import('/node_modules/three/examples/jsm/loaders/GLTFLoader.js');
  const PK = await import('/src/world/PropKit.js');
  const { rng } = await import('/src/core/Rand.js');
  const KK = await import('/src/world/KayKit.js');
  /* Both candidates are dressed through the SHIPPED recipe, KayKit.makeAtlasMaterial, rather
     than through the material their own glTF carries. Two reasons, and the first alone would
     decide it: the shipped KayKit material does not use dungeon_texture.png at all - it uses
     dungeon_texture_sandstone.png, the S718/S727 retint - so a frame drawn from the raw glTF
     material is a picture of a colour this project does not ship. The second is the comparison
     itself: makeAtlasMaterial is the toon recipe with bands, rim and ink outline, and judging a
     candidate under MeshStandard while the room around it is toon-shaded compares the shading
     models rather than the models. Each candidate keeps its OWN texture; only the recipe is
     shared. (No backticks in this comment: it lives inside a template literal.) */
  const kkAtlas = await KK.loadAtlasTexture();

  /* the generated sconce's own union bounds — the conform reference, measured here rather
     than carried from a comment */
  const genBag = PK.wallTorch({ rng: rng(0x9c0113) });
  const genBox = new THREE.Box3();
  for (const p of genBag.parts) { p.geo.computeBoundingBox(); genBox.union(p.geo.boundingBox); }
  const genH = genBox.max.y - genBox.min.y;

  const loader = new GLTFLoader();
  const out = { genH, genBox: { min: genBox.min.toArray(), max: genBox.max.toArray() }, cands: {} };

  async function bodyOf(url, preRollY) {
    const g = await loader.loadAsync(url);
    g.scene.updateMatrixWorld(true);
    const parts = [];
    let mat = null;
    g.scene.traverse((o) => {
      if (!o.isMesh || !o.geometry) return;
      const geo = o.geometry.clone();
      geo.applyMatrix4(o.matrixWorld);
      parts.push(geo);
      if (!mat) mat = o.material;
    });
    const geo = parts[0];
    if (preRollY) geo.rotateY(preRollY);          // turn the arm to reach along +Z
    geo.computeBoundingBox();
    const raw = geo.boundingBox.clone();
    const s = genH / (raw.max.y - raw.min.y);     // §729 conform: uniform, by measured height
    geo.scale(s, s, s);
    geo.computeBoundingBox();
    const bb = geo.boundingBox;
    // seat: back plate onto the wall plane (z=0), x centred, vertical span matched to the generated one
    geo.translate(-(bb.min.x + bb.max.x) / 2, genBox.min.y - bb.min.y, -bb.min.z);
    geo.computeBoundingBox();
    return { geo, mat, s, seated: { min: geo.boundingBox.min.toArray(), max: geo.boundingBox.max.toArray() } };
  }

  const A = await bodyOf('/assets/kaykit/torch_mounted.gltf', 0);
  const B = await bodyOf('/assets/tombchaser/Torch_Art.glb', -Math.PI / 2);
  /* A wears exactly what it will ship in; B wears the same recipe over its own embedded map. */
  A.mat = KK.makeAtlasMaterial(E, kkAtlas, 'pick:kaykit');
  B.mat = KK.makeAtlasMaterial(E, B.mat?.map ?? null, 'pick:tomb');
  out.mats = { A: A.mat?.name ?? null, B: B.mat?.name ?? null, atlas: kkAtlas ? 'sandstone' : 'null' };
  out.cands.A = { scale: A.s, seated: A.seated, verts: A.geo.attributes.position.count };
  out.cands.B = { scale: B.s, seated: B.seated, verts: B.geo.attributes.position.count };

  /* mount them on the +x hall wall at the midpoints between the shipped torches */
  const HALL_X = 22, HALL_Y = 4.2, RY = -Math.PI / 2;
  const group = new THREE.Group();
  group.name = 'torchpick_rig';
  const put = (body, z) => {
    const m = new THREE.Mesh(body.geo.clone(), body.mat);
    m.position.set(HALL_X, HALL_Y, z);
    m.rotation.y = RY;
    m.frustumCulled = false;
    group.add(m);
  };
  /* A and B ADJACENT, at -38 and -40, with the shipped procedural sconce at -42 next to
     them. The first pass put B at the -46 and -30 midpoints and both were column-occluded or
     off-frame in every stance that framed A, which is a comparison that cannot be made. Two
     metres apart is clear of both bodies (widest is A at 0.42 m) and puts all three art styles
     inside one 55-degree frame at 5-7 m, which is the range a player walks the aisle at. */
  put(A, -38); put(B, -40); put(B, -30);
  E.scene.add(group);
  out.mounted = [['A', -38], ['B', -40], ['B', -30]];
  return out;
})()
`;

async function main() {
  await mkdir(OUTDIR, { recursive: true });
  console.log('[torchpick] waiting for the capture lock…');
  const release = await acquire({ onWait: (ms) => process.stdout.write(`· queued for the capture lock (${(ms / 1000) | 0}s)\n`) });
  console.log('[torchpick] lock acquired');
  let server, browser;
  const meta = { sha: sha(), when: new Date().toISOString(), frames: [] };
  try {
    const port = await freePort();
    server = await startServer(port);
    browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || CHROME.find((q) => existsSync(q)), args: ARGS });
    const page = await browser.newPage({ viewport: { width: W, height: H } });
    const errs = [];
    page.on('pageerror', (e) => errs.push(String(e)));
    page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });

    /* `?torch=gen` on purpose, and it is the whole reason this frame is a three-way comparison
       rather than a two-way one. The swap ships in this tree, so without the token the level's
       own sixteen sconces ARE candidate A and the procedural body — the thing both candidates
       are being judged against — would not be in the picture at all. */
    await page.goto(`http://127.0.0.1:${port}/?torch=gen`, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction('window.__GAME && window.__GAME.ready === true', null, { timeout: 900000, polling: 500 });
    /* §731.2 — `ready` is not the player's screen. A real click, or every frame below is a
       photograph of the loading panel. */
    await page.mouse.click(Math.floor(W / 2), Math.floor(H / 2));
    await page.waitForFunction(() => {
      const b = document.getElementById('boot');
      return !b || b.classList.contains('gone');
    }, null, { timeout: 60000 });
    await page.waitForTimeout(1500);

    // three has to be reachable from the rig; main.js publishes the engine, not the library.
    await page.evaluate(async () => {
      window.__THREE = await import('/node_modules/three/build/three.module.js');
    });

    const rig = await page.evaluate(RIG);
    meta.rig = rig;
    console.log('[torchpick] conform reference genH =', rig.genH.toFixed(4));
    for (const k of ['A', 'B']) {
      const c = rig.cands[k];
      console.log(`[torchpick]   ${k}: scale ${c.scale.toFixed(4)}  verts ${c.verts}  seated `
        + `x[${c.seated.min[0].toFixed(3)},${c.seated.max[0].toFixed(3)}] `
        + `y[${c.seated.min[1].toFixed(3)},${c.seated.max[1].toFixed(3)}] `
        + `z[${c.seated.min[2].toFixed(3)},${c.seated.max[2].toFixed(3)}]`);
    }

    // stage: freeCam + hud off through the shipped path, then pose down the hall wall
    await page.evaluate(async () => { await window.__GAME.setShot('temple', { dt: 0 }); });

    const POSES = {
      // eye height, looking along the wall so all seven mounts are in one frame
      wall: { pos: [12.5, 3.4, -20.0], target: [21.0, 4.3, -44.0], fov: 55 },
      // the range a player actually walks past one at: 4 m out, looking up at it
      near: { pos: [17.6, 1.7, -37.0], target: [22.0, 4.2, -38.0], fov: 55 },
      // the three-up: procedural (-42), B (-40), A (-38), from the aisle
      trio: { pos: [16.9, 2.2, -37.4], target: [22.0, 4.3, -40.0], fov: 62 },
    };

    for (const grade of ['night', 'day']) {
      await page.evaluate((tod) => window.__GAME.setTimeOfDay(tod), grade === 'night' ? 0.02 : 0.5);
      for (const [name, p] of Object.entries(POSES)) {
        await page.evaluate(({ p }) => {
          const c = window.__ENGINE.camera;
          c.fov = p.fov; c.position.set(...p.pos);
          c.lookAt(new window.__THREE.Vector3(...p.target));
          c.updateProjectionMatrix(); c.updateMatrixWorld(true);
        }, { p });
        await page.evaluate(async () => { await window.__GAME.step(24, 0); });
        const file = path.join(OUTDIR, `${grade}-${name}.png`);
        /* `__GAME.capture()`, not `page.screenshot()`. Under swiftshader at 1280x720 with the
           whole PostFX chain, playwright's screenshot path exceeded its 30 s default inside the
           capture lock — and smashshot already reads the canvas from inside the page for its
           own reasons. The data URL is the same framebuffer, and it cannot time out. */
        const dataUrl = await page.evaluate(() => window.__GAME.capture());
        await writeFile(file, Buffer.from(String(dataUrl).split(',')[1], 'base64'));
        meta.frames.push({ grade, pose: name, cam: p, file: path.relative(ROOT, file) });
        console.log(`[torchpick] wrote ${path.relative(ROOT, file)}`);
      }
    }
    meta.errors = errs;
    await writeFile(path.join(OUTDIR, 'report.json'), JSON.stringify(meta, null, 2));
    if (errs.length) console.log(`[torchpick] ${errs.length} page error(s):\n  ${errs.slice(0, 6).join('\n  ')}`);
  } finally {
    await browser?.close();
    server?.kill();
    release();
  }
}

main().catch((e) => { console.error(e); process.exit(1); });

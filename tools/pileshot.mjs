#!/usr/bin/env node
/**
 * pileshot.mjs — §724's in-scene instrument: what do the treasure pile's OWN pixels measure,
 * in the vault, in its own light?
 *
 * The §719 order of work: measure "faded" before choosing a lever. This boots the shipped
 * game, stages the canonical `interior` shot (the vault's own contract frame), adds one
 * derived close-up from a player-reachable stance on the vault floor, and reads the pile's
 * pixels off the framebuffer through a vertex-tag footprint — the same I3 trick as
 * `canehook.mjs`, one level down: the pile's own vertices in the merged `props_gold` mesh are
 * tagged magenta through a temporary `COLOR_0`, the footprint is the difference, and every
 * statistic is then computed on the UNTAGGED base frame over that footprint.
 *
 * Three populations per frame, because "is it the light or the paint" needs controls in the
 * same frame under the same light:
 *
 *   pile   the subject — Props._treasurePile's coins+ingots at (2.9, -12, -70.8)
 *   ra     the gilded Ra statue 4 m behind it: SAME material, SAME merge, larger UV windows
 *   lime   the canopic table's polished limestone: a bright-albedo surface in the same vault
 *
 * Instrument arms: I2 (base captured twice, must differ by 0 px), I4 (restore vs base, must
 * differ by 0 px — the tag is a multiply-by-one revert, §719's argument), and the tag arms
 * themselves. The camera stance is pre-flighted by tools/camdot.mjs (run it first; this tool
 * re-reports subject distance and blockers in-page).
 *
 *   node tools/pileshot.mjs                          both frames, 1280x720, shots/pile724
 *   node tools/pileshot.mjs --out shots/pile724-before --tree /path/worktree
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

const TREE = path.resolve(opt('tree', ROOT));
const OUTDIR = path.resolve(ROOT, opt('out', 'shots/pile724'));
const W = +opt('w', 1280), H = +opt('h', 720);
const QUERY = opt('query', '');            // e.g. "?pile=flat" to capture the revert arm
const TIMEOUT = +opt('timeout', 600) * 1000;

/* The close-up: a stance ON the vault floor (y -12), 2.3 m from the `interior` shot's own
 * staged player position (1.4, -12, -66) across flat floor, eye at standing height. camdot:
 * enclosed 0/26, nearest 1.534 m, subject at 3.547 m, first surface along the ray IS the
 * pile (props_gold at 3.966 m). */
const EYE = [0.9, -10.45, -68.2];
const TARGET = [2.9, -11.8, -70.8];

function sha() {
  try { return execFileSync('git', ['rev-parse', '--short', 'HEAD'], { cwd: TREE }).toString().trim(); }
  catch { return '(no git)'; }
}

async function freePort(start = 5460) {
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

/* ---------------------------------------------------------------- in-page */

/** Everything below runs in the page; it returns numbers and data-URI PNGs only. */
async function measureFrame(page, { close }) {
  return page.evaluate(async ({ close, EYE, TARGET }) => {
    const G = window.__GAME, E = G.engine, T = G.THREE;
    const out = { arms: [] };

    await G.setShot('interior', { dt: 0 });
    if (close) {
      E.camera.position.set(...EYE);
      E.camera.lookAt(...TARGET);
      E.camera.updateMatrixWorld(true);
      /* Pre-flight, reported in the output rather than trusted from memory. */
      const eye = new T.Vector3(...EYE), tgt = new T.Vector3(...TARGET);
      const dir = tgt.clone().sub(eye), dist = dir.length(); dir.normalize();
      const shown = (o) => { for (let p = o; p; p = p.parent) if (p.visible === false) return false; return true; };
      const ray = new T.Raycaster(eye, dir, 0.01, dist * 1.5);
      const hits = ray.intersectObject(E.scene, true).filter((h) => shown(h.object) && !h.object.userData?.collisionProxy);
      out.preflight = {
        subjectDist: +dist.toFixed(3),
        firstHits: hits.slice(0, 3).map((h) => `${h.object.name || h.object.type}@${h.distance.toFixed(3)}m`),
      };
      /* Walkability of the stance: straight down from the eye must be the vault floor. */
      const down = new T.Raycaster(eye, new T.Vector3(0, -1, 0), 0.01, 5);
      const dh = down.intersectObject(E.scene, true).filter((h) => shown(h.object) && !h.object.userData?.collisionProxy);
      out.stanceFloor = dh.length ? { at: +dh[0].point.y.toFixed(3), on: dh[0].object.name || dh[0].object.type } : null;
    }
    await G.step(4, 0);

    const grab = () => {
      const png = G.capture();
      const img = new Image();
      return new Promise((res) => {
        img.onload = () => {
          const c = document.createElement('canvas');
          c.width = img.width; c.height = img.height;
          const g = c.getContext('2d', { willReadFrequently: true });
          g.drawImage(img, 0, 0);
          res({ png, data: g.getImageData(0, 0, img.width, img.height) });
        };
        img.src = png;
      });
    };

    const diffCount = (a, b, t) => {
      let n = 0;
      for (let i = 0; i < a.data.length; i += 4) {
        const d = Math.max(Math.abs(a.data[i] - b.data[i]), Math.abs(a.data[i + 1] - b.data[i + 1]), Math.abs(a.data[i + 2] - b.data[i + 2]));
        if (d > t) n++;
      }
      return n;
    };

    /* The subject meshes and vertex populations. */
    const gold = E.scene.getObjectByName('props_gold');
    const lime = E.scene.getObjectByName('props_lime');
    if (!gold) return { error: 'no props_gold' };
    const POPS = {
      pile: { mesh: gold, pred: (x, y, z) => { const dx = x - 2.9, dz = z + 70.8; return dx * dx + dz * dz < 1.75 * 1.75 && y > -12.10 && y < -11.20; } },
      ra:   { mesh: gold, pred: (x, y, z) => x > -1.3 && x < 1.3 && y > -12.0 && y < -7.0 && z > -76.5 && z < -73.9 },
      lime: { mesh: lime, pred: (x, y, z) => x > -3.0 && x < 0.1 && y > -11.6 && y < -11.0 && z > -70.4 && z < -68.8 },
    };

    /* The geometry's own state — the §719.12-style readback that lets a token run prove which
       arm it is in off the live attributes rather than off a flag. */
    {
      const pos = gold.geometry.attributes.position, guv = gold.geometry.attributes.uv;
      const col = gold.geometry.attributes.color || null;
      let uMin = 1e9, uMax = -1e9, vMin = 1e9, vMax = -1e9, nonWhite = 0, pileSample = null;
      for (let i = 0; i < pos.count; i++) {
        if (col && (col.getComponent(i, 0) !== 1 || col.getComponent(i, 1) !== 1 || col.getComponent(i, 2) !== 1)) nonWhite++;
        if (!POPS.pile.pred(pos.getX(i), pos.getY(i), pos.getZ(i))) continue;
        if (!pileSample && col) pileSample = [col.getComponent(i, 0), col.getComponent(i, 1), col.getComponent(i, 2)].map((v) => +v.toFixed(4));
        const u = guv.getX(i), v = guv.getY(i);
        if (u < uMin) uMin = u; if (u > uMax) uMax = u;
        if (v < vMin) vMin = v; if (v > vMax) vMax = v;
      }
      out.goldGeo = {
        hasColor: !!col, vertexColors: gold.material.vertexColors === true,
        nonWhite, pileSample, pileUVSpan: [+(uMax - uMin).toFixed(3), +(vMax - vMin).toFixed(3)],
      };
    }

    /* The tag must RESTORE the shipped state, not assume it was empty. §724 ships a real
       `COLOR_0` on `props_gold`, and the first version of this helper deleted it on tagOff —
       so every arm after the first measured a build with the un-tint stripped (the after run's
       own `goldGeo` line said `hasColor:false` and its I4 went 3,920 px, which is how the
       defect announced itself). The saved attribute and flag come off the live objects. */
    const _saved = new Map();
    const tagOn = (mesh, pred) => {
      if (!_saved.has(mesh)) {
        _saved.set(mesh, {
          color: mesh.geometry.attributes.color || null,
          vertexColors: mesh.material.vertexColors === true,
        });
      }
      const pos = mesh.geometry.attributes.position;
      const col = new Float32Array(pos.count * 3).fill(1);
      let tagged = 0;
      for (let i = 0; i < pos.count; i++) {
        if (pred(pos.getX(i), pos.getY(i), pos.getZ(i))) { col[i * 3 + 1] = 0; tagged++; }   // (1,0,1)
      }
      mesh.geometry.setAttribute('color', new T.BufferAttribute(col, 3));
      mesh.material.vertexColors = true;
      mesh.material.needsUpdate = true;
      return tagged;
    };
    const tagOff = (mesh) => {
      const s = _saved.get(mesh);
      if (s?.color) mesh.geometry.setAttribute('color', s.color);
      else mesh.geometry.deleteAttribute('color');
      mesh.material.vertexColors = s ? s.vertexColors : false;
      mesh.material.needsUpdate = true;
    };

    /* I2 — the base, twice. */
    const base = await grab();
    const base2 = await grab();
    out.i2 = diffCount(base.data, base2.data, 0);

    /* Tag arms. */
    const foot = {};
    for (const [name, p] of Object.entries(POPS)) {
      if (!p.mesh) { out.arms.push({ name, error: 'mesh missing' }); continue; }
      const tagged = tagOn(p.mesh, p.pred);
      await G.step(2, 0);
      const tf = await grab();
      tagOff(p.mesh);
      await G.step(2, 0);
      const restored = await grab();
      const i4 = diffCount(restored.data, base.data, 0);

      /* Footprint sweep over tag thresholds; stats on the BASE frame per threshold. */
      const sweep = [];
      for (const t of [1, 8, 16, 32, 64]) {
        let n = 0, L = 0, sat = 0, r = 0, g = 0, b = 0;
        let minx = 1e9, miny = 1e9, maxx = -1, maxy = -1;
        const w = base.data.width;
        for (let i = 0; i < base.data.data.length; i += 4) {
          const d = Math.max(
            Math.abs(base.data.data[i] - tf.data.data[i]),
            Math.abs(base.data.data[i + 1] - tf.data.data[i + 1]),
            Math.abs(base.data.data[i + 2] - tf.data.data[i + 2]));
          if (d <= t) continue;
          const R = base.data.data[i], Gc = base.data.data[i + 1], B = base.data.data[i + 2];
          n++; r += R; g += Gc; b += B;
          L += 0.2126 * R + 0.7152 * Gc + 0.0722 * B;
          const mx = Math.max(R, Gc, B), mn = Math.min(R, Gc, B);
          sat += mx > 0 ? (mx - mn) / mx : 0;
          const px = (i / 4) % w, py = Math.floor(i / 4 / w);
          if (px < minx) minx = px; if (px > maxx) maxx = px;
          if (py < miny) miny = py; if (py > maxy) maxy = py;
        }
        sweep.push(n ? {
          t, n, L: +(L / n).toFixed(1), sat: +(sat / n).toFixed(3),
          rgb: [r / n, g / n, b / n].map((v) => +v.toFixed(1)),
          bbox: [minx, miny, maxx, maxy],
        } : { t, n: 0 });
      }
      foot[name] = { tagged, i4, sweep };
      if (name === 'pile') out.tagPng = tf.png;
    }
    out.foot = foot;
    out.basePng = base.png;

    /* The vault's light, read off the live scene rather than asserted. */
    const lights = [];
    E.scene.traverse((o) => {
      if (!o.isLight) return;
      const rec = { type: o.type, intensity: +o.intensity.toFixed(3) };
      if (o.isPointLight) {
        const d = o.getWorldPosition(new T.Vector3()).distanceTo(new T.Vector3(2.9, -11.8, -70.8));
        if (d > 30) return;   // not the vault's
        rec.pos = o.getWorldPosition(new T.Vector3()).toArray().map((v) => +v.toFixed(2));
        rec.distToPile = +d.toFixed(2);
        rec.range = o.distance; rec.color = '#' + o.color.getHexString();
      } else if (o.isDirectionalLight || o.isHemisphereLight || o.isAmbientLight) {
        rec.color = '#' + o.color.getHexString();
      }
      lights.push(rec);
    });
    out.lights = lights;

    /* §712 C4's browser-side question: does the treasure share the badge material here, where
     * shading.make CACHES by option key? Asserted in Node (fallback path, fresh materials);
     * never before read in the browser. */
    const pk = E.get('pickups');
    if (pk?._coinMesh && pk.treasures?.length) {
      out.treasureMats = pk.treasures.filter((t) => t.mesh).map((t) => ({
        id: t.id,
        sharesCoinMat: t.mesh.material === pk._coinMesh.material,
        hasMap: !!t.mesh.material.map,
        mapIsBadge: !!(t.mesh.material.map && pk._coinMesh.material.map && t.mesh.material.map === pk._coinMesh.material.map),
        color: '#' + (t.mesh.material.color?.getHexString?.() ?? '??'),
      }));
    }

    /* `Engine.stats.drawCalls` is NOT quoted — five distinct frozen plausible values on record
       (§700.3/§701.11/§705); draw accounting is `tools/budgetattrib.mjs`'s job. The compiled
       program count IS real and is the §719.7-style cost of a vertexColors variant. */
    out.programs = E.renderer?.info?.programs?.length ?? null;
    return out;
  }, { close, EYE, TARGET });
}

/* ------------------------------------------------------------------ main */

await mkdir(OUTDIR, { recursive: true });
process.stdout.write(`· pileshot @ ${sha()} · serving ${TREE} → ${path.relative(ROOT, OUTDIR)}${QUERY ? ` · ${QUERY}` : ''}\n`);
const release = await acquire({ onWait: (ms) => process.stdout.write(`· waiting for the capture lock (${(ms / 1000) | 0}s)\n`) });
let server = null, browser = null;
const report = { sha: sha(), query: QUERY, eye: EYE, target: TARGET };
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
  await page.goto(`http://127.0.0.1:${port}/${QUERY}`, { waitUntil: 'domcontentloaded', timeout: 120000 });
  await page.waitForFunction('window.__GAME && window.__GAME.ready === true', null, { timeout: 300000 });

  for (const [label, close] of [['interior', false], ['close', true]]) {
    const r = await Promise.race([
      measureFrame(page, { close }),
      new Promise((_, rj) => setTimeout(() => rj(new Error(`${label} timed out`)), TIMEOUT)),
    ]);
    if (r.error) throw new Error(r.error);
    await writeFile(path.join(OUTDIR, `${label}-base.png`), Buffer.from(r.basePng.split(',')[1], 'base64'));
    if (r.tagPng) await writeFile(path.join(OUTDIR, `${label}-tag.png`), Buffer.from(r.tagPng.split(',')[1], 'base64'));
    delete r.basePng; delete r.tagPng;
    report[label] = r;
    process.stdout.write(`  ✓ ${label}: I2 ${r.i2} px` +
      Object.entries(r.foot).map(([k, f]) => `  ${k}[tag ${f.tagged} verts, I4 ${f.i4} px]`).join('') + '\n');
    for (const [k, f] of Object.entries(r.foot)) {
      for (const s of f.sweep) {
        if (!s.n) { process.stdout.write(`      ${k} T=${s.t}  n 0\n`); continue; }
        process.stdout.write(`      ${k} T=${String(s.t).padStart(2)}  n ${String(s.n).padStart(6)}  L ${s.L}  sat ${s.sat}  rgb [${s.rgb}]  bbox [${s.bbox}]\n`);
      }
    }
    if (r.preflight) process.stdout.write(`      preflight: subject ${r.preflight.subjectDist} m, first hits ${r.preflight.firstHits.join(', ') || 'none'}; stance floor ${JSON.stringify(r.stanceFloor)}\n`);
    if (r.goldGeo) process.stdout.write(`      goldGeo: ${JSON.stringify(r.goldGeo)}\n`);
    if (r.lights?.length) process.stdout.write(`      lights: ${r.lights.map((l) => `${l.type}@${l.intensity}${l.distToPile != null ? ` d${l.distToPile}` : ''}`).join('  ')}\n`);
    if (r.treasureMats) process.stdout.write(`      treasures: ${r.treasureMats.map((t) => `${t.id}{shares:${t.sharesCoinMat},map:${t.hasMap},badge:${t.mapIsBadge},color:${t.color}}`).join(' ')}\n`);
  }
  await writeFile(path.join(OUTDIR, 'report.json'), JSON.stringify(report, null, 1));
  process.stdout.write(`  ✓ report.json\n`);
} finally {
  await browser?.close().catch(() => {});
  server?.kill('SIGTERM');
  release();
}
process.exit(0);

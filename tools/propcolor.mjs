#!/usr/bin/env node
/**
 * propcolor.mjs — §727's in-scene instrument: what does each `Props.MATERIALS` bucket's
 * merged mesh measure IN THE FRAME, at day and at night, against the architecture beside it?
 *
 * `tools/proptint.mjs` gives the texture-side damage table (texture mean × tint, per entry);
 * this reads the same entries off the live framebuffer — §439/§440's rule that the FRAME is
 * measured, not the author's arithmetic. One boot; per canonical shot it stages the shipped
 * `setShot` frame (§435.4's staging), then re-grades the SAME camera to the catalogue's own
 * night (`SHOTS.night.tod`, read from the build via Debug's endpoint — §726.2's rule) through
 * the `setTimeOfDay` facility the §726 toggle routes through.
 *
 * Footprints are pileshot.mjs's vertex-tag trick, whole-bucket: every vertex of the merged
 * `props_<key>` mesh tags magenta through a temporary `COLOR_0` (tagOn/tagOff carried over
 * verbatim — the §724.9 instrument defect is already fixed in this copy: tagOff RESTORES the
 * saved attribute and flag, so §724's shipped un-tint on `props_gold` survives the tag), the
 * footprint is the difference, and every statistic is computed on the UNTAGGED base frame.
 * Architecture meshes wearing the same textures (`arch:*granite_pink*`,
 * `arch:*limestone_polished*`) are tagged identically as the same-frame controls the §724.2
 * discrimination needed: those surfaces passed every playtest, so a prop bucket reading far
 * outside its own texture's wall reading is paint, not light.
 *
 * Instrument arms per frame: I2 (base twice, 0 px) and I4 per population (restore vs base,
 * 0 px). Sweep thresholds {1,8,16,32,64} — §719.5's discipline: a conclusion that only holds
 * at one threshold is not a conclusion.
 *
 *   node tools/propcolor.mjs                            shots/propcolor727
 *   node tools/propcolor.mjs --out shots/propcolor727-after --tree /path/worktree
 *   node tools/propcolor.mjs --query "?props=tinted"    the revert arm
 *   node tools/propcolor.mjs --shots courtyard,temple   subset
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
const OUTDIR = path.resolve(ROOT, opt('out', 'shots/propcolor727'));
const W = +opt('w', 1280), H = +opt('h', 720);
const QUERY = opt('query', '');
const SHOTS = String(opt('shots', 'courtyard,temple,interior')).split(',').filter(Boolean);
const TIMEOUT = +opt('timeout', 5400) * 1000;

/* The prop buckets under audit — §727's textured entries plus `gold` as the §724 reference
 * (its pile is un-tinted, its statues still wear the entry tint). `dark`/`glass`/emissives are
 * untextured or excluded by design; `cork`/`label` have zero users (clueBottle folds all parts
 * into `glass`). */
const PROP_KEYS = ['stone', 'lime', 'gold', 'bronze', 'wood', 'rope', 'cloth', 'lapis', 'carnelian'];

/* Derived close-up stances, each from a PLAYER-REACHABLE floor position (§435.4) and each
 * pre-flighted OFFLINE by tools/camdot.mjs before it was written here (§604; the in-page
 * pre-flight below re-derives the same rays every boot):
 *   scaffold  camdot: enclosed 0/26, nearest 0.663 m, forward 6.28 m = props_wood ITSELF,
 *             subject 6.00 m — ok. Courtyard floor, eye 1.56 m (the §724 eye height).
 *   racollar  camdot: enclosed 0/26, nearest 1.535 m, forward 8.756 m = props_gold (Ra
 *             himself), subject 8.498 m — ok. Vault floor y -12.012, past the pile, aimed at
 *             the falcon's collar/feather bands (lapis + carnelian + gold in one framing).
 *   mast      camdot: enclosed 0/26, nearest 0.510 m — ok. Under the west inner banner mast.
 */
const STANCES = {
  scaffold: { base: 'courtyard', eye: [22.6, 1.56, 27.0], target: [19.75, 3.29, 31.99], keys: ['wood', 'rope'] },
  racollar: { base: 'interior', eye: [2.0, -10.45, -66.5], target: [0.131, -8.067, -74.44], keys: ['lapis', 'carnelian', 'gold'] },
  mast:     { base: 'courtyard', eye: [8.0, 1.56, 31.0], target: [8.6, 9.8, 37.4], keys: ['wood', 'cloth', 'rope', 'gold'] },
};

function sha() {
  try { return execFileSync('git', ['rev-parse', '--short', 'HEAD'], { cwd: TREE }).toString().trim(); }
  catch { return '(no git)'; }
}

async function freePort(start = 5480) {
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

async function measureShot(page, { shot, propKeys, stance }) {
  return page.evaluate(async ({ shot, propKeys, stance }) => {
    const G = window.__GAME, E = G.engine, T = G.THREE;
    const out = { shot, grades: {} };

    /* The populations: every merged props_<key> that exists, plus arch controls that wear the
     * textures the props share. Whole-mesh footprints. */
    const meshes = new Map();
    E.scene.traverse((o) => {
      if (!o.isMesh || o.userData?.isOutlineShell || o.userData?.slyOutline) return;
      for (const k of propKeys) if (o.name === `props_${k}`) meshes.set(k, o);
      if (/^arch:.*granite_pink/.test(o.name) && !meshes.has('ARCH granite')) meshes.set('ARCH granite', o);
      if (/^arch:.*limestone_polished/.test(o.name) && !meshes.has('ARCH lime')) meshes.set('ARCH lime', o);
    });
    out.meshNames = [...meshes.entries()].map(([k, m]) => `${k}=${m.name}`);

    const dbg = E.get('debug');
    const NIGHT = (dbg && typeof dbg._dnNight === 'number') ? dbg._dnNight : 0.02;
    out.nightTod = NIGHT;

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

    /* pileshot.mjs's tagOn/tagOff, with the §724.9 restore fix already in: the saved attribute
     * and flag come off the live objects and go back on tagOff. */
    const _saved = new Map();
    const tagOn = (mesh) => {
      if (!_saved.has(mesh)) {
        _saved.set(mesh, {
          color: mesh.geometry.attributes.color || null,
          vertexColors: mesh.material.vertexColors === true,
        });
      }
      const pos = mesh.geometry.attributes.position;
      const col = new Float32Array(pos.count * 3).fill(1);
      for (let i = 0; i < pos.count; i++) col[i * 3 + 1] = 0;   // (1,0,1) magenta, every vertex
      mesh.geometry.setAttribute('color', new T.BufferAttribute(col, 3));
      mesh.material.vertexColors = true;
      mesh.material.needsUpdate = true;
      return pos.count;
    };
    const tagOff = (mesh) => {
      const s = _saved.get(mesh);
      if (s?.color) mesh.geometry.setAttribute('color', s.color);
      else mesh.geometry.deleteAttribute('color');
      mesh.material.vertexColors = s ? s.vertexColors : false;
      mesh.material.needsUpdate = true;
    };

    const hueOf = (r, g, b) => {
      const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn;
      if (d < 1e-6) return 0;
      let h;
      if (mx === r) h = ((g - b) / d) % 6; else if (mx === g) h = (b - r) / d + 2; else h = (r - g) / d + 4;
      return ((h * 60) + 360) % 360;
    };

    async function measureGrade(label, tod) {
      const g = { tod, pops: {} };
      if (tod != null) { G.setTimeOfDay(tod); await G.step(4, 0); }
      const base = await grab();
      const base2 = await grab();
      g.i2 = diffCount(base.data, base2.data, 0);
      g.basePng = base.png;

      /* One restore-verify per GRADE rather than per population (the first run of this tool
       * timed out at 30 min on the per-pop verify's extra 3 renders each): every pop still
       * runs tagOff, and the FINAL restored frame is diffed against base — a restore leak
       * that persists is caught there, and a transient leak poisons the NEXT pop's footprint
       * into an absurd n, which the cross-shot tables would show. §724.9's defect class (a
       * tagOff that strips the shipped attribute) still lands in this net: it persists. */
      for (const [name, mesh] of meshes) {
        const tagged = tagOn(mesh);
        await G.step(2, 0);
        const tf = await grab();
        tagOff(mesh);
        await G.step(1, 0);

        const sweep = [];
        for (const t of [1, 8, 16, 32, 64]) {
          let n = 0, L = 0, sat = 0, r = 0, gg = 0, b = 0, hx = 0, hy = 0;
          for (let i = 0; i < base.data.data.length; i += 4) {
            const d = Math.max(
              Math.abs(base.data.data[i] - tf.data.data[i]),
              Math.abs(base.data.data[i + 1] - tf.data.data[i + 1]),
              Math.abs(base.data.data[i + 2] - tf.data.data[i + 2]));
            if (d <= t) continue;
            const R = base.data.data[i], Gc = base.data.data[i + 1], B = base.data.data[i + 2];
            n++; r += R; gg += Gc; b += B;
            L += 0.2126 * R + 0.7152 * Gc + 0.0722 * B;
            const mx = Math.max(R, Gc, B), mn = Math.min(R, Gc, B);
            sat += mx > 0 ? (mx - mn) / mx : 0;
            const h = hueOf(R, Gc, B) * Math.PI / 180;
            hx += Math.cos(h); hy += Math.sin(h);
          }
          sweep.push(n ? {
            t, n, L: +(L / n).toFixed(1), sat: +(sat / n).toFixed(3),
            rgb: [r / n, gg / n, b / n].map((v) => +v.toFixed(1)),
            hue: +(((Math.atan2(hy, hx) * 180 / Math.PI) + 360) % 360).toFixed(1),
          } : { t, n: 0 });
        }
        g.pops[name] = { tagged, sweep };
        const s8 = sweep.find((s) => s.t === 8);
        console.log(`[pop] ${label} ${name} tagged ${tagged} n8 ${s8?.n ?? 0} L ${s8?.L ?? '-'}`);
      }
      /* The grade's restore-verify: one more settle then base equality. */
      await G.step(1, 0);
      const restored = await grab();
      g.i4 = diffCount(restored.data, base.data, 0);
      console.log(`[grade] ${label} done · I2 ${g.i2} px · final I4 ${g.i4} px`);
      return g;
    }

    await G.setShot(stance ? stance.base : shot, { dt: 0 });
    if (stance) {
      E.camera.position.set(...stance.eye);
      E.camera.lookAt(...stance.target);
      E.camera.updateMatrixWorld(true);
      /* Pre-flight re-derived in-page every boot (pileshot's discipline): first hits along
       * the look ray, and the floor under the eye — a stance is only player-reachable if a
       * player could stand there. */
      const eye = new T.Vector3(...stance.eye), tgt = new T.Vector3(...stance.target);
      const dir = tgt.clone().sub(eye), dist = dir.length(); dir.normalize();
      const shown = (o) => { for (let p = o; p; p = p.parent) if (p.visible === false) return false; return true; };
      const ray = new T.Raycaster(eye, dir, 0.01, dist * 1.5);
      const hits = ray.intersectObject(E.scene, true).filter((h) => shown(h.object) && !h.object.userData?.collisionProxy);
      const down = new T.Raycaster(eye, new T.Vector3(0, -1, 0), 0.01, 5);
      const dh = down.intersectObject(E.scene, true).filter((h) => shown(h.object) && !h.object.userData?.collisionProxy);
      out.preflight = {
        subjectDist: +dist.toFixed(3),
        firstHits: hits.slice(0, 3).map((h) => `${h.object.name || h.object.type}@${h.distance.toFixed(3)}m`),
        stanceFloor: dh.length ? { at: +dh[0].point.y.toFixed(3), on: dh[0].object.name || dh[0].object.type } : null,
      };
    }
    await G.step(4, 0);
    const dayTod = E.debug.timeOfDay;
    out.grades.day = await measureGrade('day', null);
    out.grades.day.tod = dayTod;
    out.grades.night = await measureGrade('night', NIGHT);
    G.setTimeOfDay(dayTod);   // leave the boot where the shot staged it
    await G.step(2, 0);
    out.programs = E.renderer?.info?.programs?.length ?? null;
    return out;
  }, { shot, propKeys, stance });
}

/* ------------------------------------------------------------------ main */

await mkdir(OUTDIR, { recursive: true });
process.stdout.write(`· propcolor @ ${sha()} · serving ${TREE} → ${path.relative(ROOT, OUTDIR)}${QUERY ? ` · ${QUERY}` : ''} · shots ${SHOTS.join(',')}\n`);
const release = await acquire({ onWait: (ms) => process.stdout.write(`· waiting for the capture lock (${(ms / 1000) | 0}s)\n`) });
let server = null, browser = null;
const report = { sha: sha(), query: QUERY, shots: {} };
try {
  const port = await freePort();
  server = await startServer(port);
  browser = await chromium.launch({
    executablePath: process.env.CHROME_PATH
      || ['/opt/pw-browsers/chromium', '/usr/bin/chromium', '/usr/bin/chromium-browser'].find(existsSync),
    args: ['--no-sandbox', '--disable-dev-shm-usage', '--use-gl=angle', '--use-angle=swiftshader',
      '--enable-unsafe-swiftshader', '--enable-webgl', '--ignore-gpu-blocklist',
      '--disable-frame-rate-limit', '--js-flags=--max-old-space-size=4096',
      '--force-device-scale-factor=1', '--hide-scrollbars'],
  });
  const page = await browser.newPage({ viewport: { width: W, height: H } });
  page.on('pageerror', (e) => process.stdout.write(`  [page] ${e.message}\n`));
  page.on('console', (m) => { const t = m.text(); if (t.startsWith('[pop]') || t.startsWith('[grade]')) process.stdout.write(`  ${t}\n`); });
  await page.goto(`http://127.0.0.1:${port}/${QUERY}`, { waitUntil: 'domcontentloaded', timeout: 120000 });
  await page.waitForFunction('window.__GAME && window.__GAME.ready === true', null, { timeout: 300000 });

  for (const shot of SHOTS) {
    const r = await Promise.race([
      measureShot(page, { shot, propKeys: STANCES[shot]?.keys ?? PROP_KEYS, stance: STANCES[shot] ?? null }),
      new Promise((_, rj) => setTimeout(() => rj(new Error(`${shot} timed out`)), TIMEOUT)),
    ]);
    for (const [grade, g] of Object.entries(r.grades)) {
      await writeFile(path.join(OUTDIR, `${shot}-${grade}-base.png`), Buffer.from(g.basePng.split(',')[1], 'base64'));
      delete g.basePng;
    }
    report.shots[shot] = r;
    process.stdout.write(`  ✓ ${shot} (night tod ${r.nightTod}) · ${r.meshNames.join(' ')}\n`);
    if (r.preflight) process.stdout.write(`    preflight: subject ${r.preflight.subjectDist} m, first hits ${r.preflight.firstHits.join(', ') || 'none'}; floor ${JSON.stringify(r.preflight.stanceFloor)}\n`);
    /* Incremental: a late shot's failure must not lose the completed shots' numbers. */
    await writeFile(path.join(OUTDIR, 'report.json'), JSON.stringify(report, null, 1));
    for (const [grade, g] of Object.entries(r.grades)) {
      process.stdout.write(`    ${grade} tod ${g.tod} · I2 ${g.i2} px · final I4 ${g.i4} px\n`);
      for (const [k, f] of Object.entries(g.pops)) {
        const s8 = f.sweep.find((s) => s.t === 8);
        const s32 = f.sweep.find((s) => s.t === 32);
        const fmt = (s) => s && s.n ? `n ${s.n} L ${s.L} sat ${s.sat} hue ${s.hue} rgb [${s.rgb}]` : 'n 0';
        process.stdout.write(`      ${k.padEnd(12)} tag ${String(f.tagged).padStart(6)}  T8 ${fmt(s8)}  | T32 ${fmt(s32)}\n`);
      }
    }
  }
  await writeFile(path.join(OUTDIR, 'report.json'), JSON.stringify(report, null, 1));
  process.stdout.write(`  ✓ report.json\n`);
} finally {
  await browser?.close().catch(() => {});
  server?.kill('SIGTERM');
  release();
}
process.exit(0);

#!/usr/bin/env node
/**
 * kkflat.mjs — §736's instrument: WHY do the KayKit props read flat next to the architecture,
 * when both measure the same saturation?
 *
 * §727 answered the owner's "the props look faded" as a CHROMA problem and the verdict on the
 * result was "they always looked faded". The brief for this lane measured the shipped prop
 * atlas at sat 0.560 / val 0.721 against `arch sandstone_block` at 0.552 / 0.788 — i.e. the
 * two populations are already the same chroma, so chroma cannot be what separates them to an
 * eye that says one looks right and the other does not.
 *
 * So this tool measures the OTHER axis: **local contrast**. A surface that carries per-pixel
 * variation reads as a material; one that does not reads as a paint chip at the same hue and
 * the same brightness. The statistic is a high-pass RMS on luma, computed on the UNTAGGED base
 * frame over an ERODED footprint (so a silhouette edge, which is a contrast cliff belonging to
 * the background, can never be counted as surface detail).
 *
 * Populations are whole-mesh footprints via propcolor.mjs's vertex-tag trick (magenta COLOR_0,
 * tag / capture / diff / restore, statistics on the base frame). Carried verbatim including
 * §724.9's restore fix.
 *
 * INSTRUMENT ARMS, in-arm every run (§439/§440 — an instrument with no controls proves nothing):
 *   I2   base captured twice, 0 px            — the frame is deterministic
 *   I4   restored frame vs base, 0 px         — no tag leaked
 *   POS  `props_dark` — `MATERIALS.dark` is `tex: null`, one flat colour, no normal map, no
 *        detail preset, no grain. It is the flattest surface the project can build. If it does
 *        not measure flattest, the metric is not measuring flatness.
 *   NEG  `arch:*sandstone_block*` — colour + normal + roughness + AO maps + the `sandstone`
 *        triplanar detail preset (strength 0.85, grain 0.42). The owner says this looks right.
 *        If the metric cannot separate NEG from POS it cannot see what the owner sees.
 *
 * Both grades every run (§466.5): the shot's own tod, then the catalogue night read off the
 * build (`Debug._dnNight`, §726.2's rule) through the same `setTimeOfDay` the §726 L1 toggle uses.
 *
 *   node tools/kkflat.mjs                                shots/kkflat
 *   node tools/kkflat.mjs --out shots/kkflat-after
 *   node tools/kkflat.mjs --query "?kk=flat"             the revert arm
 *   node tools/kkflat.mjs --shots interior,courtyard
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
const OUTDIR = path.resolve(ROOT, opt('out', 'shots/kkflat'));
const W = +opt('w', 1280), H = +opt('h', 720);
const QUERY = opt('query', '');
const SHOTS = String(opt('shots', 'interior,courtyard,temple,night')).split(',').filter(Boolean);
const TIMEOUT = +opt('timeout', 5400) * 1000;

function sha() {
  try { return execFileSync('git', ['rev-parse', '--short', 'HEAD'], { cwd: TREE }).toString().trim(); }
  catch { return '(no git)'; }
}

async function freePort(start = 5560) {
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
  if (!existsSync(bin)) throw new Error(`vite not installed in ${TREE}`);
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

async function measureShot(page, { shot }) {
  return page.evaluate(async ({ shot }) => {
    const G = window.__GAME, E = G.engine, T = G.THREE;
    const out = { shot, grades: {} };

    /* ---- populations. Whole-mesh footprints, named by what they ARE, not by module. ---- */
    const meshes = new Map();
    const put = (k, o) => { if (!meshes.has(k)) meshes.set(k, o); };
    const chars = [];
    E.scene.traverse((o) => {
      if (!o.isMesh || o.userData?.isOutlineShell || o.userData?.slyOutline) return;
      const n = o.name || '';
      const mn = o.material?.name || '';
      if (n === 'props_kaykit') put('KK props', o);
      if (/^smashable_/.test(n) && mn === 'smash:kaykit') put('KK smash', o);
      if (n === 'kaykit_showcase' || mn === 'kaykit:atlas') put('KK showcase', o);
      if (/sandstone_block/.test(mn)) put('NEG arch sandstone', o);
      if (/paving_courtyard/.test(mn)) put('arch paving', o);
      if (/limestone_polished/.test(mn)) put('arch lime', o);
      if (n === 'props_dark') put('POS props_dark', o);
      if (n === 'props_lime') put('props_lime', o);
      if (n === 'props_stone') put('props_stone', o);
      if (o.isSkinnedMesh && !/eyeball/i.test(n)) chars.push(o);
    });
    /* The character is several submeshes; the biggest skinned one is the body, which is the
       surface the brief's `PAL.blue` row is about. */
    if (chars.length) {
      chars.sort((a, b) => (b.geometry?.attributes?.position?.count || 0) - (a.geometry?.attributes?.position?.count || 0));
      put('CHAR body', chars[0]);
    }
    out.meshNames = [...meshes.entries()].map(([k, m]) => `${k}=${m.name || m.type}/${m.material?.name || '?'}`);

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

    /* propcolor.mjs's tagOn/tagOff verbatim, §724.9 restore fix included. */
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
      for (let i = 0; i < pos.count; i++) col[i * 3 + 1] = 0;
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

    /* ---- the metric ------------------------------------------------------
       `mask` is the tag/base difference at threshold t. Every statistic below is on the BASE
       frame. `erode(r)` keeps a pixel only when every pixel within Chebyshev radius r is also
       in the mask, so a silhouette — which is a step between two DIFFERENT surfaces, not
       detail on either — cannot be counted. HP is then the RMS of (L - boxmean(L)) at two
       window sizes: 3 px is what survives FXAA, 7 px is the mid-frequency mottle a detail
       layer's second octave puts in. `hpRel` divides by mean L, because a dark region has
       trivially small absolute contrast and the eye judges the ratio. */
    const lumaOf = (d) => {
      const L = new Float32Array(d.width * d.height);
      for (let i = 0, p = 0; i < d.data.length; i += 4, p++) {
        L[p] = 0.2126 * d.data[i] + 0.7152 * d.data[i + 1] + 0.0722 * d.data[i + 2];
      }
      return L;
    };
    const erode = (mask, w, h, r) => {
      const outm = new Uint8Array(w * h);
      for (let y = r; y < h - r; y++) {
        for (let x = r; x < w - r; x++) {
          if (!mask[y * w + x]) continue;
          let ok = 1;
          for (let dy = -r; dy <= r && ok; dy++) {
            for (let dx = -r; dx <= r; dx++) if (!mask[(y + dy) * w + x + dx]) { ok = 0; break; }
          }
          if (ok) outm[y * w + x] = 1;
        }
      }
      return outm;
    };
    const hpRms = (L, mask, w, h, r) => {
      let s = 0, n = 0;
      const win = (2 * r + 1) * (2 * r + 1);
      for (let y = r; y < h - r; y++) {
        for (let x = r; x < w - r; x++) {
          if (!mask[y * w + x]) continue;
          let sum = 0;
          for (let dy = -r; dy <= r; dy++) {
            const row = (y + dy) * w + x;
            for (let dx = -r; dx <= r; dx++) sum += L[row + dx];
          }
          const d = L[y * w + x] - sum / win;
          s += d * d; n++;
        }
      }
      return { rms: n ? Math.sqrt(s / n) : 0, n };
    };
    const hueOf = (r, g, b) => {
      const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn;
      if (d < 1e-6) return 0;
      let h;
      if (mx === r) h = ((g - b) / d) % 6; else if (mx === g) h = (b - r) / d + 2; else h = (r - g) / d + 4;
      return ((h * 60) + 360) % 360;
    };

    function statsFor(base, tf, t) {
      const d0 = base.data, d1 = tf.data;
      const w = d0.width, h = d0.height;
      const mask = new Uint8Array(w * h);
      let n = 0, L = 0, sat = 0, val = 0, hx = 0, hy = 0, L2 = 0;
      for (let i = 0, p = 0; i < d0.data.length; i += 4, p++) {
        const dd = Math.max(
          Math.abs(d0.data[i] - d1.data[i]),
          Math.abs(d0.data[i + 1] - d1.data[i + 1]),
          Math.abs(d0.data[i + 2] - d1.data[i + 2]));
        if (dd <= t) continue;
        mask[p] = 1;
        const R = d0.data[i], Gc = d0.data[i + 1], B = d0.data[i + 2];
        const l = 0.2126 * R + 0.7152 * Gc + 0.0722 * B;
        n++; L += l; L2 += l * l;
        const mx = Math.max(R, Gc, B), mn = Math.min(R, Gc, B);
        sat += mx > 0 ? (mx - mn) / mx : 0;
        val += mx / 255;
        const hh = hueOf(R, Gc, B) * Math.PI / 180;
        hx += Math.cos(hh); hy += Math.sin(hh);
      }
      if (!n) return { t, n: 0 };
      const lum = lumaOf(d0);
      const m1 = erode(mask, w, h, 1);
      const m3 = erode(mask, w, h, 3);
      const h3 = hpRms(lum, m1, w, h, 1);
      const h7 = hpRms(lum, m3, w, h, 3);
      const meanL = L / n;
      return {
        t, n,
        L: +meanL.toFixed(1),
        sat: +(sat / n).toFixed(3),
        val: +(val / n).toFixed(3),
        hue: +(((Math.atan2(hy, hx) * 180 / Math.PI) + 360) % 360).toFixed(1),
        sdL: +Math.sqrt(Math.max(0, L2 / n - meanL * meanL)).toFixed(2),
        hp3: +h3.rms.toFixed(3), n3: h3.n,
        hp7: +h7.rms.toFixed(3), n7: h7.n,
        hp3Rel: +(meanL > 1 ? h3.rms / meanL : 0).toFixed(4),
        hp7Rel: +(meanL > 1 ? h7.rms / meanL : 0).toFixed(4),
      };
    }

    async function measureGrade(label, tod) {
      const g = { tod, pops: {} };
      if (tod != null) { G.setTimeOfDay(tod); await G.step(4, 0); }
      const base = await grab();
      const base2 = await grab();
      g.i2 = diffCount(base.data, base2.data, 0);
      g.basePng = base.png;

      for (const [name, mesh] of meshes) {
        const tagged = tagOn(mesh);
        await G.step(2, 0);
        const tf = await grab();
        tagOff(mesh);
        await G.step(1, 0);
        const sweep = [8, 16, 32].map((t) => statsFor(base, tf, t));
        g.pops[name] = { tagged, sweep };
        const s = sweep.find((x) => x.t === 16);
        console.log(`[pop] ${label} ${name} n16 ${s?.n ?? 0} L ${s?.L ?? '-'} sat ${s?.sat ?? '-'} hp3 ${s?.hp3 ?? '-'} hp7 ${s?.hp7 ?? '-'}`);
      }
      await G.step(1, 0);
      const restored = await grab();
      g.i4 = diffCount(restored.data, base.data, 0);
      console.log(`[grade] ${label} done · I2 ${g.i2} px · final I4 ${g.i4} px`);
      return g;
    }

    await G.setShot(shot, { dt: 0 });
    await G.step(4, 0);
    const dayTod = E.debug.timeOfDay;
    out.grades.day = await measureGrade('day', null);
    out.grades.day.tod = dayTod;
    out.grades.night = await measureGrade('night', NIGHT);
    G.setTimeOfDay(dayTod);
    await G.step(2, 0);
    out.programs = E.renderer?.info?.programs?.length ?? null;
    return out;
  }, { shot });
}

/** Texture-side companion: the same high-pass statistic on the SOURCE images, once per boot. */
async function measureTextures(page) {
  return page.evaluate(async () => {
    const G = window.__GAME, E = G.engine;
    const tex = E.get('textures');
    const rows = [];
    const hp = (data, w, h, ch, r) => {
      const L = new Float32Array(w * h);
      for (let i = 0; i < w * h; i++) {
        L[i] = 0.2126 * data[i * ch] + 0.7152 * data[i * ch + 1] + 0.0722 * data[i * ch + 2];
      }
      let s = 0, n = 0, mean = 0, sat = 0;
      for (let i = 0; i < w * h; i++) {
        mean += L[i];
        const R = data[i * ch], Gc = data[i * ch + 1], B = data[i * ch + 2];
        const mx = Math.max(R, Gc, B), mn = Math.min(R, Gc, B);
        sat += mx > 0 ? (mx - mn) / mx : 0;
      }
      mean /= (w * h); sat /= (w * h);
      const win = (2 * r + 1) * (2 * r + 1);
      for (let y = r; y < h - r; y++) {
        for (let x = r; x < w - r; x++) {
          let sum = 0;
          for (let dy = -r; dy <= r; dy++) { const row = (y + dy) * w + x; for (let dx = -r; dx <= r; dx++) sum += L[row + dx]; }
          const d = L[y * w + x] - sum / win; s += d * d; n++;
        }
      }
      return { w, h, meanL: +mean.toFixed(1), sat: +sat.toFixed(3), hp: +Math.sqrt(s / n).toFixed(3) };
    };
    const readImage = (t) => {
      const im = t?.image;
      if (!im) return null;
      if (im.data && im.width) return { data: im.data, w: im.width, h: im.height, ch: im.data.length / (im.width * im.height) };
      const c = document.createElement('canvas');
      c.width = im.width; c.height = im.height;
      const g = c.getContext('2d', { willReadFrequently: true });
      g.drawImage(im, 0, 0);
      const d = g.getImageData(0, 0, im.width, im.height);
      return { data: d.data, w: d.width, h: d.height, ch: 4 };
    };
    /* The atlas, off the shipped material rather than re-fetched. */
    let atlasTex = null;
    E.scene.traverse((o) => {
      if (atlasTex) return;
      if (o.isMesh && /kaykit/.test(o.material?.name || '')) atlasTex = o.material.map || null;
    });
    if (atlasTex) {
      const im = readImage(atlasTex);
      if (im) rows.push({ name: 'kaykit atlas (shipped)', ...hp(im.data, im.w, im.h, im.ch, 1), r: 1 });
    }
    for (const key of ['sandstone_block', 'paving_courtyard', 'limestone_polished', 'granite_pink']) {
      let t = null;
      try { t = tex?.get?.(key); } catch { t = null; }
      const map = t?.map ?? (t?.isTexture ? t : null);
      const im = map ? readImage(map) : null;
      if (im) rows.push({ name: `arch ${key}`, ...hp(im.data, im.w, im.h, im.ch, 1), r: 1 });
    }
    return rows;
  });
}

/* ------------------------------------------------------------------ main */

await mkdir(OUTDIR, { recursive: true });
process.stdout.write(`· kkflat @ ${sha()} · serving ${TREE} → ${path.relative(ROOT, OUTDIR)}${QUERY ? ` · ${QUERY}` : ''} · shots ${SHOTS.join(',')}\n`);
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

  report.textures = await measureTextures(page);
  process.stdout.write('  texture-side high-pass (r=1, on the source image):\n');
  for (const r of report.textures) {
    process.stdout.write(`    ${r.name.padEnd(28)} ${r.w}x${r.h}  meanL ${String(r.meanL).padStart(6)}  sat ${r.sat}  HP3rms ${r.hp}\n`);
  }

  for (const shot of SHOTS) {
    const r = await Promise.race([
      measureShot(page, { shot }),
      new Promise((_, rj) => setTimeout(() => rj(new Error(`${shot} timed out`)), TIMEOUT)),
    ]);
    for (const [grade, g] of Object.entries(r.grades)) {
      await writeFile(path.join(OUTDIR, `${shot}-${grade}-base.png`), Buffer.from(g.basePng.split(',')[1], 'base64'));
      delete g.basePng;
    }
    report.shots[shot] = r;
    process.stdout.write(`  ✓ ${shot} (night tod ${r.nightTod})\n     ${r.meshNames.join('\n     ')}\n`);
    await writeFile(path.join(OUTDIR, 'report.json'), JSON.stringify(report, null, 1));
    for (const [grade, g] of Object.entries(r.grades)) {
      process.stdout.write(`    ${grade} tod ${g.tod} · I2 ${g.i2} px · final I4 ${g.i4} px\n`);
      process.stdout.write(`      ${'population'.padEnd(20)} ${'n'.padStart(7)} ${'L'.padStart(6)} ${'sat'.padStart(6)} ${'val'.padStart(6)} ${'sdL'.padStart(6)} ${'hp3'.padStart(7)} ${'hp7'.padStart(7)} ${'hp7Rel'.padStart(7)}\n`);
      for (const [k, f] of Object.entries(g.pops)) {
        const s = f.sweep.find((x) => x.t === 16);
        if (!s || !s.n) { process.stdout.write(`      ${k.padEnd(20)}       0  (not in frame)\n`); continue; }
        process.stdout.write(`      ${k.padEnd(20)} ${String(s.n).padStart(7)} ${String(s.L).padStart(6)} ${String(s.sat).padStart(6)} ${String(s.val).padStart(6)} ${String(s.sdL).padStart(6)} ${String(s.hp3).padStart(7)} ${String(s.hp7).padStart(7)} ${String(s.hp7Rel).padStart(7)}\n`);
      }
    }
  }
  await writeFile(path.join(OUTDIR, 'report.json'), JSON.stringify(report, null, 1));
  process.stdout.write('  ✓ report.json\n');
} finally {
  await browser?.close().catch(() => {});
  server?.kill('SIGTERM');
  release();
}
process.exit(0);

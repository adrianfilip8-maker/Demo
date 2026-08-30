#!/usr/bin/env node
/**
 * kkgrade.mjs — §736's designer: one boot, N candidate surface recipes for
 * `KayKit.makeAtlasMaterial`, every one of them measured on the SAME pixels.
 *
 * `tools/kkflat.mjs` establishes what the props lack. This picks the recipe that supplies it,
 * and the discipline that makes it worth anything is that the FOOTPRINT IS FIXED: the KayKit
 * mask is derived ONCE per grade, by tagging the shipped material, and every candidate arm is
 * then scored over exactly that pixel set. Nothing an arm does to the picture can move its own
 * denominator, which is the failure this project keeps recording (§442: the right quantity on
 * a subject that moved under it).
 *
 * The architecture in the same frame is measured once per grade and is the TARGET, not a
 * secondary reading — the owner's sentence is "the architecture looks fine, the props look
 * flat", so the bar is the arch row, in that frame, at that grade.
 *
 * Arms in-frame every run, exactly as in kkflat.mjs: I2 (base twice, 0 px), the known-flat
 * positive control (`props_dark`) and the known-detailed negative control (arch sandstone).
 *
 *   node tools/kkgrade.mjs --shots interior,courtyard
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

const OUTDIR = path.resolve(ROOT, opt('out', 'shots/kkgrade'));
const W = +opt('w', 1280), H = +opt('h', 720);
const SHOTS = String(opt('shots', 'interior,courtyard')).split(',').filter(Boolean);
const TIMEOUT = +opt('timeout', 7200) * 1000;
const SAVE = String(opt('save', '')).split(',').filter(Boolean);   // arm ids to write a PNG for
const PICK = String(opt('arms', '')).split(',').filter(Boolean);   // run only these arm ids
const QUERY = opt('query', '');
/* `--probe` boots, prints what every atlas material actually carries, and exits. It is how the
 * URL token is verified end to end (`?kk=flat` is read at MODULE LOAD, so it cannot be poked
 * in-page) without paying for a full capture pass. */
const PROBE = argv.includes('--probe');

/* The candidate recipes. Every one carries the SHIPPED base (white × atlas, 3 bands, rim 0.5,
 * the 0.0034 ink shell) and differs only in the surface authoring the shipped recipe omits.
 * `A0` IS the shipped bag, character for character — it is the control, and its numbers must
 * reproduce kkflat.mjs's `KK props` row or this rig is not measuring the shipped material. */
const DETAIL_ARCH = { detail: 'sandstone', detailScale: 1.2, detailStrength: 0.85, detailGrain: 0.42 };  // the arch preset, scaled for prop-sized bodies
const DETAIL_FINE = { detail: 'sandstone', detailScale: 2.4, detailStrength: 1.0, detailGrain: 0.55 };
const SURFACE = { rough: 0.9, spec: 0.14, gloss: 20, sss: 0 };   // sandstone_block's own numbers; arch passes sss 0
const ARMS = [
  { id: 'A0', label: 'shipped (control)', add: {} },
  /* THE GRADE. `0xcdcdcd` is DERIVED by `tools/kkalbedo.mjs`, not chosen: it is the neutral
     linear multiplier (k = 0.6105) that puts the props' own placed albedo (world-area weighted
     over the shipped bodies, L 120.3 / sat 0.560) on the architecture's graded-albedo MEAN
     (L 95.34, measured in-page over the five recipes TEXTURES builds). Neutral on purpose: a
     grey multiply leaves the texture's chroma where it was (0.560 -> 0.571 is the 8-bit
     rounding), so this lever is LUMINANCE and nothing else — which is what separates it from
     §727's max-normalised chroma blend, the lever the owner has already rejected. */
  { id: 'G', label: 'derived neutral grade 0xcdcdcd (albedo L 120.3 -> 95.3, sat 0.560 -> 0.571)', add: { color: 0xcdcdcd } },
  { id: 'W', label: 'arch warm tint 0xe6b073 (L -> 86.8, sat -> 0.816) — the chromatic alternative', add: { color: 0xe6b073 } },
  /* The three levers this lane's brief named, each ALONE so each can be convicted or acquitted
     on its own number rather than smuggled in inside a bundle. */
  { id: 'D1', label: 'detail only, arch preset @ scale 1.2', add: { ...DETAIL_ARCH } },
  { id: 'S1', label: 'surface only (rough .9 spec .14 gloss 20 sss 0)', add: { ...SURFACE } },
  { id: 'GD', label: 'G + D1 + S1 — everything at once', add: { color: 0xcdcdcd, ...DETAIL_ARCH, ...SURFACE } },
  /* The REVERT arm, for the verification pass on the shipped tree: once §736 is in, `A0` IS the
     graded material and `FLAT` is what `?kk=flat` restores, so one boot carries both sides of
     the before/after on one footprint. */
  { id: 'FLAT', label: '?kk=flat — the pre-§736 ungraded white', add: { color: 0xffffff } },
];

/* A derived close stance on the courtyard wall baskets, aimed at real placements read off the
 * shipped build (`props_kaykit`'s merged vertices cluster at x −12.66 / −5.91 / −2.95, z 31,
 * y ≈ 0.3). Pre-flighted IN-PAGE every boot — first hits along the look ray and the floor under
 * the eye — because a stance is only worth quoting if a player could stand in it (§435.4). */
const STANCES = {
  baskets: { base: 'courtyard', eye: [-4.4, 1.56, 26.6], target: [-4.4, 0.5, 31.0] },
};

function sha() {
  try { return execFileSync('git', ['rev-parse', '--short', 'HEAD'], { cwd: ROOT }).toString().trim(); }
  catch { return '(no git)'; }
}
async function freePort(start = 5620) {
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

async function measureShot(page, { shot, arms, save, stance }) {
  return page.evaluate(async ({ shot, arms, save, stance }) => {
    const G = window.__GAME, E = G.engine, T = G.THREE;
    const out = { shot, grades: {}, pngs: {} };

    const kk = [];            // every mesh wearing the atlas recipe
    let archMesh = null, darkMesh = null, paveMesh = null;
    E.scene.traverse((o) => {
      if (!o.isMesh || o.userData?.isOutlineShell || o.userData?.slyOutline) return;
      const mn = o.material?.name || '';
      /* The atlas RECIPE, not every mesh whose name contains "kaykit": `ContactDecals` names
         its own batch `world.decals.kaykit` and wears a different material entirely. The first
         run of this rig swept it in and swapped a decal's material for a barrel's — the arm
         numbers from that run are void and §736's record says so. */
      if (mn === 'kaykit:atlas' || mn === 'props:kaykit' || mn === 'smash:kaykit') kk.push(o);
      if (!archMesh && /sandstone_block/.test(mn)) archMesh = o;
      if (!paveMesh && /paving_courtyard/.test(mn)) paveMesh = o;
      if (!darkMesh && o.name === 'props_dark') darkMesh = o;
    });
    out.kk = kk.map((m) => `${m.name || m.type}/${m.material.name}`);
    out.arch = archMesh ? archMesh.name : null;
    out.dark = darkMesh ? darkMesh.name : null;
    if (!kk.length) return out;

    const shipped = kk.map((m) => m.material);
    const shading = E.get('shading');
    const dbg = E.get('debug');
    const NIGHT = (dbg && typeof dbg._dnNight === 'number') ? dbg._dnNight : 0.02;
    out.nightTod = NIGHT;

    /* The shipped option bag, transcribed from KayKit.makeAtlasMaterial. Every arm is this
       object plus its own overrides, so an arm can only differ by what it names. */
    const BASE = { color: 0xffffff, map: shipped[0].map || null, bands: 3, rim: 0.5, outline: 0.0034, outlineColor: 0x1a1210 };

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
    const _saved = new Map();
    const tagOn = (mesh) => {
      if (!_saved.has(mesh)) _saved.set(mesh, { color: mesh.geometry.attributes.color || null, vertexColors: mesh.material.vertexColors === true });
      const pos = mesh.geometry.attributes.position;
      const col = new Float32Array(pos.count * 3).fill(1);
      for (let i = 0; i < pos.count; i++) col[i * 3 + 1] = 0;
      mesh.geometry.setAttribute('color', new T.BufferAttribute(col, 3));
      mesh.material.vertexColors = true; mesh.material.needsUpdate = true;
    };
    const tagOff = (mesh) => {
      const s = _saved.get(mesh);
      if (s?.color) mesh.geometry.setAttribute('color', s.color); else mesh.geometry.deleteAttribute('color');
      mesh.material.vertexColors = s ? s.vertexColors : false; mesh.material.needsUpdate = true;
    };

    const lumaOf = (d) => {
      const L = new Float32Array(d.width * d.height);
      for (let i = 0, p = 0; i < d.data.length; i += 4, p++) L[p] = 0.2126 * d.data[i] + 0.7152 * d.data[i + 1] + 0.0722 * d.data[i + 2];
      return L;
    };
    const erode = (mask, w, h, r) => {
      const o = new Uint8Array(w * h);
      for (let y = r; y < h - r; y++) for (let x = r; x < w - r; x++) {
        if (!mask[y * w + x]) continue;
        let ok = 1;
        for (let dy = -r; dy <= r && ok; dy++) for (let dx = -r; dx <= r; dx++) if (!mask[(y + dy) * w + x + dx]) { ok = 0; break; }
        if (ok) o[y * w + x] = 1;
      }
      return o;
    };
    const hpRms = (L, mask, w, h, r) => {
      let s = 0, n = 0; const win = (2 * r + 1) * (2 * r + 1);
      for (let y = r; y < h - r; y++) for (let x = r; x < w - r; x++) {
        if (!mask[y * w + x]) continue;
        let sum = 0;
        for (let dy = -r; dy <= r; dy++) { const row = (y + dy) * w + x; for (let dx = -r; dx <= r; dx++) sum += L[row + dx]; }
        const d = L[y * w + x] - sum / win; s += d * d; n++;
      }
      return n ? Math.sqrt(s / n) : 0;
    };
    /* Footprint from a tag pass: the mask is a property of the GEOMETRY, so it is taken once
       per grade on the shipped material and reused for every arm. */
    const maskOf = async (meshes, base) => {
      for (const m of meshes) tagOn(m);
      await G.step(2, 0);
      const tf = await grab();
      for (const m of meshes) tagOff(m);
      await G.step(1, 0);
      const w = base.data.width, h = base.data.height;
      const mask = new Uint8Array(w * h);
      let n = 0;
      for (let i = 0, p = 0; i < base.data.data.length; i += 4, p++) {
        const d = Math.max(
          Math.abs(base.data.data[i] - tf.data.data[i]),
          Math.abs(base.data.data[i + 1] - tf.data.data[i + 1]),
          Math.abs(base.data.data[i + 2] - tf.data.data[i + 2]));
        if (d > 16) { mask[p] = 1; n++; }
      }
      return { mask, n, w, h, m1: null, m3: null };
    };
    const score = (frame, M) => {
      const d = frame.data, w = M.w, h = M.h;
      let n = 0, L = 0, sat = 0, val = 0, L2 = 0;
      const Ls = [];
      for (let i = 0, p = 0; i < d.data.length; i += 4, p++) {
        if (!M.mask[p]) continue;
        const R = d.data[i], Gc = d.data[i + 1], B = d.data[i + 2];
        const l = 0.2126 * R + 0.7152 * Gc + 0.0722 * B;
        n++; L += l; L2 += l * l; Ls.push(l);
        const mx = Math.max(R, Gc, B), mn = Math.min(R, Gc, B);
        sat += mx > 0 ? (mx - mn) / mx : 0; val += mx / 255;
      }
      if (!n) return { n: 0 };
      /* Saturation over the population's own middle luma half — the control the raw mean
         needs, since AgX desaturates with brightness and two populations at different
         luminance cannot be compared on the raw figure at all. */
      Ls.sort((a, b) => a - b);
      const lo = Ls[Math.floor(n * 0.25)], hi = Ls[Math.floor(n * 0.75)];
      let ns = 0, ss = 0;
      for (let i = 0, p = 0; i < d.data.length; i += 4, p++) {
        if (!M.mask[p]) continue;
        const R = d.data[i], Gc = d.data[i + 1], B = d.data[i + 2];
        const l = 0.2126 * R + 0.7152 * Gc + 0.0722 * B;
        if (l < lo || l > hi) continue;
        const mx = Math.max(R, Gc, B), mn = Math.min(R, Gc, B);
        ss += mx > 0 ? (mx - mn) / mx : 0; ns++;
      }
      const lum = lumaOf(d);
      const h3 = hpRms(lum, M.m1, w, h, 1);
      const h7 = hpRms(lum, M.m3, w, h, 3);
      const meanL = L / n;
      return {
        n, L: +meanL.toFixed(1), sat: +(sat / n).toFixed(3), val: +(val / n).toFixed(3),
        satMid: +(ns ? ss / ns : 0).toFixed(3),
        sdL: +Math.sqrt(Math.max(0, L2 / n - meanL * meanL)).toFixed(2),
        hp3: +h3.toFixed(3), hp7: +h7.toFixed(3),
        hp7Rel: +(meanL > 1 ? h7 / meanL : 0).toFixed(4),
      };
    };

    async function measureGrade(label, tod) {
      const g = { tod, arms: {}, refs: {} };
      if (tod != null) { G.setTimeOfDay(tod); await G.step(4, 0); }
      const base = await grab();
      const base2 = await grab();
      g.i2 = diffCount(base.data, base2.data, 0);

      const MKK = await maskOf(kk, base);
      MKK.m1 = erode(MKK.mask, MKK.w, MKK.h, 1);
      MKK.m3 = erode(MKK.mask, MKK.w, MKK.h, 3);
      g.kkMask = MKK.n;
      for (const [name, mesh] of [['NEG arch sandstone', archMesh], ['REF arch paving', paveMesh], ['POS props_dark', darkMesh]]) {
        if (!mesh) { g.refs[name] = { n: 0 }; continue; }
        const M = await maskOf([mesh], base);
        M.m1 = erode(M.mask, M.w, M.h, 1); M.m3 = erode(M.mask, M.w, M.h, 3);
        g.refs[name] = score(base, M);
        console.log(`[ref] ${label} ${name} ${JSON.stringify(g.refs[name])}`);
      }

      for (const arm of arms) {
        const mats = kk.map(() => null);
        if (arm.id === 'A0') { kk.forEach((m, i) => { m.material = shipped[i]; }); }
        else {
          const made = shading.make({ name: `kkgrade:${arm.id}`, ...BASE, ...arm.add });
          kk.forEach((m, i) => { mats[i] = made; m.material = made; });
        }
        await G.step(2, 0);
        const f = await grab();
        g.arms[arm.id] = { label: arm.label, add: arm.add, ...score(f, MKK) };
        if (save.includes(arm.id)) out.pngs[`${label}-${arm.id}`] = f.png;
        console.log(`[arm] ${label} ${arm.id} ${JSON.stringify(g.arms[arm.id])}`);
      }
      kk.forEach((m, i) => { m.material = shipped[i]; });
      await G.step(2, 0);
      const restored = await grab();
      g.i4 = diffCount(restored.data, base.data, 0);
      console.log(`[grade] ${label} I2 ${g.i2} · I4 ${g.i4} · kk mask ${g.kkMask}`);
      return g;
    }

    await G.setShot(stance ? stance.base : shot, { dt: 0 });
    if (stance) {
      E.camera.position.set(...stance.eye);
      E.camera.lookAt(...stance.target);
      E.camera.updateMatrixWorld(true);
      const eye = new T.Vector3(...stance.eye), tgt = new T.Vector3(...stance.target);
      const dir = tgt.clone().sub(eye), dist = dir.length(); dir.normalize();
      const shown = (o) => { for (let p = o; p; p = p.parent) if (p.visible === false) return false; return true; };
      const ray = new T.Raycaster(eye, dir, 0.01, dist * 2.5);
      const hits = ray.intersectObject(E.scene, true).filter((h) => shown(h.object) && !h.object.userData?.collisionProxy);
      const down = new T.Raycaster(eye, new T.Vector3(0, -1, 0), 0.01, 5);
      const dh = down.intersectObject(E.scene, true).filter((h) => shown(h.object) && !h.object.userData?.collisionProxy);
      out.preflight = {
        subjectDist: +dist.toFixed(3),
        firstHits: hits.slice(0, 4).map((h) => `${h.object.name || h.object.type}@${h.distance.toFixed(3)}m`),
        stanceFloor: dh.length ? { at: +dh[0].point.y.toFixed(3), on: dh[0].object.name || dh[0].object.type } : null,
      };
    }
    await G.step(4, 0);
    const dayTod = E.debug.timeOfDay;
    out.grades.day = await measureGrade('day', null);
    out.grades.day.tod = dayTod;
    out.grades.night = await measureGrade('night', NIGHT);
    G.setTimeOfDay(dayTod);
    await G.step(2, 0);
    return out;
  }, { shot, arms, save, stance });
}

await mkdir(OUTDIR, { recursive: true });
process.stdout.write(`· kkgrade @ ${sha()} → ${path.relative(ROOT, OUTDIR)} · shots ${SHOTS.join(',')}\n`);
const release = await acquire({ onWait: (ms) => process.stdout.write(`· waiting for the capture lock (${(ms / 1000) | 0}s)\n`) });
let server = null, browser = null;
const report = { sha: sha(), arms: ARMS, shots: {} };
try {
  const port = await freePort();
  server = await startServer(port);
  browser = await chromium.launch({
    executablePath: process.env.CHROME_PATH || ['/opt/pw-browsers/chromium', '/usr/bin/chromium', '/usr/bin/chromium-browser'].find(existsSync),
    args: ['--no-sandbox', '--disable-dev-shm-usage', '--use-gl=angle', '--use-angle=swiftshader',
      '--enable-unsafe-swiftshader', '--enable-webgl', '--ignore-gpu-blocklist',
      '--disable-frame-rate-limit', '--js-flags=--max-old-space-size=4096',
      '--force-device-scale-factor=1', '--hide-scrollbars'],
  });
  const page = await browser.newPage({ viewport: { width: W, height: H } });
  page.on('pageerror', (e) => process.stdout.write(`  [page] ${e.message}\n`));
  page.on('console', (m) => { const t = m.text(); if (/^\[(arm|ref|grade)\]/.test(t)) process.stdout.write(`  ${t}\n`); });
  await page.goto(`http://127.0.0.1:${port}/${QUERY}`, { waitUntil: 'domcontentloaded', timeout: 120000 });
  await page.waitForFunction('window.__GAME && window.__GAME.ready === true', null, { timeout: 300000 });

  /* What the SHIPPED materials actually carry, read off the live objects. */
  const live = await page.evaluate(() => {
    const E = window.__GAME.engine, out = [];
    const seen = new Set();
    E.scene.traverse((o) => {
      const mn = o.material?.name || '';
      if (!['kaykit:atlas', 'props:kaykit', 'smash:kaykit'].includes(mn) || seen.has(mn)) return;
      seen.add(mn);
      out.push({ mat: mn, color: '0x' + o.material.color.getHex().toString(16).padStart(6, '0'),
        map: o.material.map ? `${o.material.map.image?.width}x${o.material.map.image?.height}` : 'NO MAP',
        detail: o.material.userData?.detail ?? null,
        spec: o.material.userData?.slyUniforms?.uSpec?.value ?? null,
        sss: o.material.userData?.slyUniforms?.uSss?.value ?? null });
    });
    return { mats: out, programs: E.renderer?.info?.programs?.length ?? null };
  });
  report.live = live;
  process.stdout.write(`  live atlas materials${QUERY ? ` (${QUERY})` : ''}: ${JSON.stringify(live.mats)}\n  programs ${live.programs}\n`);
  if (PROBE) { await writeFile(path.join(OUTDIR, 'probe.json'), JSON.stringify(report, null, 1)); throw { __probe: true }; }

  for (const spec of SHOTS) {
    const [shotName, stanceName] = spec.split(':');
    const stance = stanceName ? STANCES[stanceName] : null;
    const shot = shotName;
    const r = await Promise.race([
      measureShot(page, { shot, arms: PICK.length ? ARMS.filter((a) => PICK.includes(a.id)) : ARMS, save: SAVE, stance }),
      new Promise((_, rj) => setTimeout(() => rj(new Error(`${spec} timed out`)), TIMEOUT)),
    ]);
    for (const [k, png] of Object.entries(r.pngs || {})) {
      await writeFile(path.join(OUTDIR, `${spec.replace(':', '-')}-${k}.png`), Buffer.from(png.split(',')[1], 'base64'));
    }
    delete r.pngs;
    report.shots[spec] = r;
    await writeFile(path.join(OUTDIR, 'report.json'), JSON.stringify(report, null, 1));
    process.stdout.write(`  ✓ ${spec} · kk meshes ${JSON.stringify(r.kk)}\n`);
    if (r.preflight) process.stdout.write(`     preflight ${JSON.stringify(r.preflight)}\n`);
  }
  process.stdout.write('  ✓ report.json\n');
} catch (e) {
  if (!e?.__probe) throw e;
} finally {
  await browser?.close().catch(() => {});
  server?.kill('SIGTERM');
  release();
}
process.exit(0);

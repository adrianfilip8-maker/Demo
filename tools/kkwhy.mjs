#!/usr/bin/env node
/**
 * !! THE PER-POPULATION KNOCK-OUT HALF OF THIS FILE HAS NEVER RUN TO COMPLETION. !!
 *
 * `measureAlbedo` — the graded-albedo table, which is where §736's finding came from — ran and
 * its numbers are quoted in KNOWN_ISSUES §736.2 and in `KayKit.KK_GRADE`'s header. `measureShot`
 * did not: at 18 renders per population under SwiftShader it projected to ~2.7 h for three
 * shots, and this lane stopped it after one population rather than hold the capture lock for
 * that. The attribution it would have produced was obtained a cheaper way instead
 * (`tools/kkgrade.mjs`, which builds each candidate as a real material and scores it on a fixed
 * footprint), so nothing downstream depends on the half that did not run. Do not quote a
 * knock-out row from this file until someone has watched it finish. §735's rule.
 *
 * kkwhy.mjs — §736's ATTRIBUTION instrument: on the props' own pixels, and on the
 * architecture's, how much of what reaches the screen is albedo and how much is the shader's
 * additive terms?
 *
 * `tools/kkflat.mjs` reports what each population MEASURES. This reports WHY, by removing one
 * term at a time from ONE material and re-capturing — `mat.userData.slyUniforms` carries the
 * per-material `uSpec` / `uRim` / `uSss` / `uDetailStrength`, so a knock-out touches exactly
 * one population and nothing else in the frame moves. Every statistic is taken over that
 * population's own FIXED footprint, derived once by the vertex tag before any knock-out runs,
 * so no arm can move its own denominator (§442).
 *
 * It also settles the ALBEDO comparison the brief could not: `Architecture`'s albedo is
 * `texture × recipe.color` and the KayKit atlas's is `texture × white`, so the honest
 * like-for-like is the GRADED texture, computed here in LINEAR (§719's rule — that is the
 * space `<color_fragment>` multiplies in), not the recipe hex against the atlas mean.
 *
 * Arms, in-frame, every run:
 *   I2    base twice, 0 px                      — determinism
 *   I4    every uniform restored vs base, 0 px  — no knock-out leaked
 *   POS   `props_dark` (tex null, one flat colour, no detail) must read flattest
 *   NEG   `arch:*sandstone_block*` (maps + the sandstone triplanar preset) must read richest
 *   Both grades (§466.5): the shot's own tod, then the catalogue night off the build.
 *
 *   node tools/kkwhy.mjs --shots courtyard,interior
 *   node tools/kkwhy.mjs --shots courtyard --stance baskets
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

const OUTDIR = path.resolve(ROOT, opt('out', 'shots/kkwhy'));
const W = +opt('w', 1280), H = +opt('h', 720);
const QUERY = opt('query', '');
const SHOTS = String(opt('shots', 'courtyard,interior')).split(',').filter(Boolean);
const TIMEOUT = +opt('timeout', 7200) * 1000;

/* Derived close stances, each aimed at a REAL placement read off the shipped build (the
 * courtyard wall baskets cluster at x −12.66 / −5.91 / −2.95, z 31, y ≈ 0.3, measured by
 * clustering `props_kaykit`'s merged vertices headlessly), and each pre-flighted IN-PAGE every
 * boot: first hits along the look ray plus the floor under the eye, because a stance is only
 * worth quoting if a player could stand in it (§435.4). Eye height 1.56 m is §724's. */
const STANCES = {
  baskets: { base: 'courtyard', eye: [-4.4, 1.56, 26.6], target: [-4.4, 0.5, 31.0] },
};

function sha() {
  try { return execFileSync('git', ['rev-parse', '--short', 'HEAD'], { cwd: ROOT }).toString().trim(); }
  catch { return '(no git)'; }
}
async function freePort(start = 5680) {
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

/** The graded-albedo table: texture × recipe colour, in linear, per texel. One pass, no lock. */
async function measureAlbedo(page) {
  return page.evaluate(async () => {
    const E = window.__GAME.engine;
    const tex = E.get('textures');
    const rows = [];
    const s2l = (v) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
    const l2s = (v) => (v <= 0.0031308 ? v * 12.92 : 1.055 * v ** (1 / 2.4) - 0.055);
    const LUT = new Float32Array(256);
    for (let i = 0; i < 256; i++) LUT[i] = s2l(i / 255);
    const stat = (data, w, h, ch, tint, r) => {
      const tl = [s2l(((tint >> 16) & 255) / 255), s2l(((tint >> 8) & 255) / 255), s2l((tint & 255) / 255)];
      const L = new Float32Array(w * h);
      let mL = 0, mSat = 0, n = 0;
      for (let i = 0; i < w * h; i++) {
        const a = ch === 4 ? data[i * ch + 3] : 255;
        const R = Math.round(255 * l2s(LUT[data[i * ch]] * tl[0]));
        const G = Math.round(255 * l2s(LUT[data[i * ch + 1]] * tl[1]));
        const B = Math.round(255 * l2s(LUT[data[i * ch + 2]] * tl[2]));
        L[i] = 0.2126 * R + 0.7152 * G + 0.0722 * B;
        if (a > 128) {
          const mx = Math.max(R, G, B), mn = Math.min(R, G, B);
          mSat += mx > 0 ? (mx - mn) / mx : 0; mL += L[i]; n++;
        }
      }
      let s = 0, c = 0; const win = (2 * r + 1) * (2 * r + 1);
      for (let y = r; y < h - r; y++) for (let x = r; x < w - r; x++) {
        let sum = 0;
        for (let dy = -r; dy <= r; dy++) { const row = (y + dy) * w + x; for (let dx = -r; dx <= r; dx++) sum += L[row + dx]; }
        const d = L[y * w + x] - sum / win; s += d * d; c++;
      }
      return { L: +(mL / n).toFixed(1), sat: +(mSat / n).toFixed(3), hp: +Math.sqrt(s / c).toFixed(3) };
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
    /* The recipe tints, read off the LIVE materials rather than transcribed, so this table
       cannot go stale against Architecture.js. */
    const tints = new Map();
    E.scene.traverse((o) => {
      const mn = o.material?.name || '';
      if (/^arch:/.test(mn) && !tints.has(mn)) tints.set(mn, o.material.color.getHex ? o.material.color.clone() : null);
    });
    let atlasTex = null;
    E.scene.traverse((o) => { if (!atlasTex && o.isMesh && /kaykit/.test(o.material?.name || '')) atlasTex = o.material.map || null; });
    if (atlasTex) {
      const im = readImage(atlasTex);
      if (im) rows.push({ name: 'kaykit atlas', tint: '0xffffff (none)', authored: stat(im.data, im.w, im.h, im.ch, 0xffffff, 1), graded: stat(im.data, im.w, im.h, im.ch, 0xffffff, 1) });
    }
    /* Architecture's own recipes, tint taken from the built material's `.color` (which IS
       `recipe.color`) so the row describes what the frame draws. */
    const WANT = { sandstone_block: 0, paving_courtyard: 0, limestone_polished: 0, hieroglyph_wall: 0, column_papyrus: 0 };
    for (const key of Object.keys(WANT)) {
      let mat = null;
      E.scene.traverse((o) => { if (!mat && new RegExp(key).test(o.material?.name || '')) mat = o.material; });
      let t = null; try { t = tex?.get?.(key); } catch { t = null; }
      const map = t?.map ?? (t?.isTexture ? t : null);
      const im = map ? readImage(map) : null;
      if (!im) continue;
      /* three stores material.color in LINEAR; convert back to the 8-bit sRGB hex the recipe
         is written as, so `stat` can do its own linearisation once, one way, for every row. */
      const hex = mat ? mat.color.getHex() : 0xffffff;
      rows.push({
        name: `arch ${key}`, tint: '0x' + hex.toString(16).padStart(6, '0'),
        authored: stat(im.data, im.w, im.h, im.ch, 0xffffff, 1),
        graded: stat(im.data, im.w, im.h, im.ch, hex, 1),
      });
    }
    return rows;
  });
}

async function measureShot(page, { shot, stance }) {
  return page.evaluate(async ({ shot, stance }) => {
    const G = window.__GAME, E = G.engine, T = G.THREE;
    const out = { shot, stance: stance ? stance.base : null, grades: {}, masks: {} };

    /* ---- populations ------------------------------------------------------------------ */
    const pops = new Map();          // label -> { meshes: [], mat }
    const add = (k, o) => {
      if (!pops.has(k)) pops.set(k, { meshes: [], mat: o.material });
      pops.get(k).meshes.push(o);
    };
    const character = E.get('character');
    const charRoot = character?.root || null;
    const underChar = (o) => { for (let p = o; p; p = p.parent) if (p === charRoot) return true; return false; };
    E.scene.traverse((o) => {
      if (!o.isMesh || o.userData?.isOutlineShell || o.userData?.slyOutline) return;
      const n = o.name || '', mn = o.material?.name || '';
      if (mn === 'kaykit:atlas') add('KK setdress', o);
      else if (mn === 'props:kaykit') add('KK statics', o);
      else if (mn === 'smash:kaykit') add('KK smash', o);
      else if (/sandstone_block/.test(mn)) add('NEG arch sandstone', o);
      else if (/paving_courtyard/.test(mn)) add('arch paving', o);
      else if (/column_papyrus/.test(mn)) add('arch column', o);
      else if (n === 'props_dark') add('POS props_dark', o);
      else if (n === 'props_lime') add('props_lime (proc)', o);
      else if (charRoot && underChar(o) && !/eyeball/i.test(n)) add('CHAR', o);
    });
    out.pops = [...pops.entries()].map(([k, v]) => `${k}: ${v.meshes.length} mesh(es) [${v.meshes.map((m) => m.name || m.type).join(' ')}] mat ${v.mat?.name}`);

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
    const lumaOf = (d) => {
      const L = new Float32Array(d.width * d.height);
      for (let i = 0, p = 0; i < d.data.length; i += 4, p++) L[p] = 0.2126 * d.data[i] + 0.7152 * d.data[i + 1] + 0.0722 * d.data[i + 2];
      return L;
    };
    const hpRms = (L, mask, w, h, r) => {
      let s = 0, n = 0; const win = (2 * r + 1) * (2 * r + 1);
      for (let y = r; y < h - r; y++) for (let x = r; x < w - r; x++) {
        if (!mask[y * w + x]) continue;
        let sum = 0;
        for (let dy = -r; dy <= r; dy++) { const row = (y + dy) * w + x; for (let dx = -r; dx <= r; dx++) sum += L[row + dx]; }
        const d = L[y * w + x] - sum / win; s += d * d; n++;
      }
      return { rms: n ? Math.sqrt(s / n) : 0, n };
    };
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
      return { mask, n, w, h, m1: erode(mask, w, h, 1), m3: erode(mask, w, h, 3) };
    };
    /* Statistics over a fixed mask. `satMid` is the mean saturation over the population's own
       middle luma half — the control the raw mean needs, because saturation falls with
       luminance under AgX and two populations at different brightness cannot be compared on
       the raw figure at all. */
    const score = (frame, M) => {
      const d = frame.data;
      const Ls = [];
      let n = 0, L = 0, sat = 0, val = 0, L2 = 0;
      for (let i = 0, p = 0; i < d.data.length; i += 4, p++) {
        if (!M.mask[p]) continue;
        const R = d.data[i], Gc = d.data[i + 1], B = d.data[i + 2];
        const l = 0.2126 * R + 0.7152 * Gc + 0.0722 * B;
        n++; L += l; L2 += l * l; Ls.push(l);
        const mx = Math.max(R, Gc, B), mn = Math.min(R, Gc, B);
        sat += mx > 0 ? (mx - mn) / mx : 0; val += mx / 255;
      }
      if (!n) return { n: 0 };
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
      const h3 = hpRms(lum, M.m1, M.w, M.h, 1);
      const h7 = hpRms(lum, M.m3, M.w, M.h, 3);
      const meanL = L / n;
      return {
        n, L: +meanL.toFixed(1), sat: +(sat / n).toFixed(3), val: +(val / n).toFixed(3),
        satMid: +(ns ? ss / ns : 0).toFixed(3), midBand: [Math.round(lo), Math.round(hi)],
        sdL: +Math.sqrt(Math.max(0, L2 / n - meanL * meanL)).toFixed(2),
        hp3: +h3.rms.toFixed(3), n3: h3.n, hp7: +h7.rms.toFixed(3), n7: h7.n,
      };
    };

    /* The knock-outs. One material, one uniform, back afterwards. */
    const KNOCK = [
      { id: 'spec0', u: 'uSpec', v: 0 },
      { id: 'rim0', u: 'uRim', v: 0 },
      { id: 'sss0', u: 'uSss', v: 0 },
      { id: 'detail0', u: 'uDetailStrength', v: 0 },
      { id: 'grain0', u: 'uDetailGrain', v: 0 },
    ];

    async function measureGrade(label, tod) {
      const g = { tod, pops: {} };
      if (tod != null) { G.setTimeOfDay(tod); await G.step(4, 0); }
      const base = await grab();
      const base2 = await grab();
      g.i2 = diffCount(base.data, base2.data, 0);
      g.basePng = base.png;

      for (const [name, pop] of pops) {
        const M = await maskOf(pop.meshes, base);
        const row = { n: M.n, base: score(base, M), knock: {} };
        const un = pop.mat?.userData?.slyUniforms || null;
        /* The material's own authoring, read off the LIVE object. `map` is here because the
           first look at a frame suggested the props might be drawing untextured, and a guess
           about that is worth nothing next to the uuid and the image size. */
        row.uniforms = un ? {
          spec: un.uSpec?.value, gloss: un.uGloss?.value, rough: pop.mat.roughness,
          rim: un.uRim?.value, sss: un.uSss?.value,
          detail: pop.mat.userData.detail ?? null,
          detailStrength: un.uDetailStrength?.value, detailGrain: un.uDetailGrain?.value,
          color: '0x' + pop.mat.color.getHex().toString(16).padStart(6, '0'),
          map: pop.mat.map ? `${pop.mat.map.name || 'map'} ${pop.mat.map.image?.width || '?'}x${pop.mat.map.image?.height || '?'}` : 'NO MAP',
          normalMap: !!pop.mat.normalMap, aoMap: !!pop.mat.aoMap, roughnessMap: !!pop.mat.roughnessMap,
        } : null;
        /* The mask, drawn. Every table row above is a claim about a set of pixels, and the one
           way to be sure the row is about the objects its NAME says is to look at them
           (§442). Day only — the footprint is the same geometry at either grade. */
        if (label === 'day' && M.n > 0) {
          const c = document.createElement('canvas');
          c.width = M.w; c.height = M.h;
          const g = c.getContext('2d');
          const im = new ImageData(new Uint8ClampedArray(base.data.data), M.w, M.h);
          for (let p = 0; p < M.w * M.h; p++) {
            if (!M.mask[p]) { im.data[p * 4] = (im.data[p * 4] * 0.35) | 0; im.data[p * 4 + 1] = (im.data[p * 4 + 1] * 0.35) | 0; im.data[p * 4 + 2] = (im.data[p * 4 + 2] * 0.35) | 0; continue; }
            im.data[p * 4] = Math.min(255, im.data[p * 4] * 0.5 + 128);
            im.data[p * 4 + 2] = Math.min(255, im.data[p * 4 + 2] * 0.5 + 128);
          }
          g.putImageData(im, 0, 0);
          out.masks[name.replace(/[^a-z0-9]+/gi, '_')] = c.toDataURL('image/png');
        }
        if (M.n > 200 && un) {
          for (const k of KNOCK) {
            const uni = un[k.u];
            if (!uni || uni.value === k.v) { row.knock[k.id] = null; continue; }
            const old = uni.value;
            uni.value = k.v;
            await G.step(2, 0);
            const f = await grab();
            uni.value = old;
            const s = score(f, M);
            row.knock[k.id] = { dL: +(row.base.L - s.L).toFixed(2), dSat: +(row.base.sat - s.sat).toFixed(4), dHp7: +(row.base.hp7 - s.hp7).toFixed(3) };
          }
          await G.step(1, 0);
        }
        g.pops[name] = row;
        const b = row.base;
        console.log(`[pop] ${label} ${name} n ${M.n} L ${b.L} sat ${b.sat} satMid ${b.satMid} hp3 ${b.hp3}/${b.n3} hp7 ${b.hp7}/${b.n7} knock ${JSON.stringify(row.knock)}`);
      }
      await G.step(1, 0);
      const restored = await grab();
      g.i4 = diffCount(restored.data, base.data, 0);
      console.log(`[grade] ${label} I2 ${g.i2} · I4 ${g.i4}`);
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
  }, { shot, stance });
}

await mkdir(OUTDIR, { recursive: true });
process.stdout.write(`· kkwhy @ ${sha()} → ${path.relative(ROOT, OUTDIR)}${QUERY ? ' · ' + QUERY : ''} · ${SHOTS.join(',')}\n`);
const release = await acquire({ onWait: (ms) => process.stdout.write(`· waiting for the capture lock (${(ms / 1000) | 0}s)\n`) });
let server = null, browser = null;
const report = { sha: sha(), query: QUERY, shots: {} };
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
  page.on('console', (m) => { const t = m.text(); if (/^\[(pop|grade)\]/.test(t)) process.stdout.write(`  ${t}\n`); });
  await page.goto(`http://127.0.0.1:${port}/${QUERY}`, { waitUntil: 'domcontentloaded', timeout: 120000 });
  await page.waitForFunction('window.__GAME && window.__GAME.ready === true', null, { timeout: 300000 });

  report.albedo = await measureAlbedo(page);
  process.stdout.write('  albedo, authored vs GRADED (texture x recipe colour, in linear):\n');
  process.stdout.write(`    ${'surface'.padEnd(26)} ${'tint'.padEnd(12)} ${'authored L/sat/HP3'.padEnd(26)} graded L/sat/HP3\n`);
  for (const r of report.albedo) {
    process.stdout.write(`    ${r.name.padEnd(26)} ${r.tint.padEnd(12)} ${`${r.authored.L} / ${r.authored.sat} / ${r.authored.hp}`.padEnd(26)} ${r.graded.L} / ${r.graded.sat} / ${r.graded.hp}\n`);
  }

  for (const spec of SHOTS) {
    const [shotName, stanceName] = spec.split(':');
    const stance = stanceName ? STANCES[stanceName] : (STANCES[shotName] || null);
    const r = await Promise.race([
      measureShot(page, { shot: stance ? stance.base : shotName, stance }),
      new Promise((_, rj) => setTimeout(() => rj(new Error(`${spec} timed out`)), TIMEOUT)),
    ]);
    for (const [grade, g] of Object.entries(r.grades)) {
      await writeFile(path.join(OUTDIR, `${spec.replace(':', '-')}-${grade}.png`), Buffer.from(g.basePng.split(',')[1], 'base64'));
      delete g.basePng;
    }
    for (const [k, png] of Object.entries(r.masks || {})) {
      await writeFile(path.join(OUTDIR, `${spec.replace(':', '-')}-mask-${k}.png`), Buffer.from(png.split(',')[1], 'base64'));
    }
    delete r.masks;
    report.shots[spec] = r;
    await writeFile(path.join(OUTDIR, 'report.json'), JSON.stringify(report, null, 1));
    process.stdout.write(`  ✓ ${spec}\n     ${r.pops.join('\n     ')}\n`);
    if (r.preflight) process.stdout.write(`     preflight ${JSON.stringify(r.preflight)}\n`);
  }
  process.stdout.write('  ✓ report.json\n');
} finally {
  await browser?.close().catch(() => {});
  server?.kill('SIGTERM');
  release();
}
process.exit(0);

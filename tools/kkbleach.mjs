#!/usr/bin/env node
/**
 * kkbleach.mjs — §737's instrument: WHICH TERM is bleaching the imported props, measured per
 * OBJECT, by turning one term off at a time and re-reading the same pixels.
 *
 * ── Why this exists when §736 already measured the props ────────────────────────────────────
 *
 * §736 reported the props at satMid 0.363 against architecture 0.397 and read that as near
 * parity. Hand-sampled patches on individual objects in §736's own shipped frame read 0.02-0.33
 * on props against 0.36-0.44 on architecture. Both measurements are arithmetically correct.
 * They disagree because §736 POOLED the population, and the defect is not uniform across it:
 *
 *     chest        (a box)              sat 0.557   <- MORE saturated than the architecture
 *     barrel       (a cylinder)         sat 0.303
 *     coin stack   (a cylinder)         sat 0.287-0.325
 *     canopic jar  (small, rounded)     sat 0.020-0.185, hue drifting to CYAN
 *
 * Same material, same atlas, same `KK_GRADE`, same room, same lights. Pool them and the box
 * pays for the jar. So this instrument's first commitment is that **the subject is one object**
 * — masks are per-mesh, every row is per-object, and the pooled row is printed beside them only
 * so the pooling loss is visible rather than argued.
 *
 * ── The mask ───────────────────────────────────────────────────────────────────────────────
 *
 * Taken by raycasting the shot camera through the LIVE scene inside the boot that renders the
 * frames. Not from `tools/lvl.mjs`: that builder has no terrain and no KayKit, and its own
 * header records an investigation that sampled a dune instead of the sphinxes it was aiming at.
 * Registration is therefore by construction — same camera object, same scene graph, same frame.
 *
 * Every hit records the INTERPOLATED shading normal (barycentric over the face's vertex
 * normals), because that is the normal the shader's fresnel consumes and these bodies are
 * smooth-shaded; the flat face normal would report a faceted barrel as flat.
 *
 * ── The arms ───────────────────────────────────────────────────────────────────────────────
 *
 * ATTRIBUTION BEFORE FIX (§737's rule, and the one thing §727 and §736 both skipped): no
 * candidate is built until a knock-out says how much of the gap that term owns. Each arm pins
 * exactly one term and every arm is scored on the SAME mask, which was taken before any arm ran
 * and cannot be moved by one — §736.4's fixed-footprint discipline, kept.
 *
 * Uniform pins go through `Object.defineProperty` rather than assignment, because several of
 * these uniforms are REPUBLISHED every frame from `setKeyLight` / `_publish` (uAmbIntensity is,
 * uRim is not) and an assignment to a republished uniform is a poke that silently does nothing
 * — the §736 trap where `uRimGain` reported the value the harness asked for and rendered
 * another. A pinned property survives republication by construction, and the I4 arm proves the
 * restore.
 *
 * CLOCK. Every arm is captured through `G.step(n, 0)` and the only staging call that advances
 * the world clock is the once-per-shot `setShot` before the mask, so all arms of a shot share one
 * animation phase — which is what the I2 control's 0.000 in all four grade-frames is evidence of
 * (§251: `decalsign`'s null arm differed from itself on 52 % of pixels at 0.28 s of drift).
 *
 *   node tools/kkbleach.mjs --shots interior --grades day,night
 *   node tools/kkbleach.mjs --census            # boot, census, exit (no mask, no arms)
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
const flag = (n) => { const i = argv.indexOf(`--${n}`); if (i < 0) return false; argv.splice(i, 1); return true; };

const OUTDIR = path.resolve(ROOT, opt('out', 'shots/kkbleach'));
const W = +opt('w', 1280), H = +opt('h', 720);
const STRIDE = +opt('stride', 2);
const SHOTS = String(opt('shots', 'interior')).split(',').filter(Boolean);
const GRADES = String(opt('grades', 'day,night')).split(',').filter(Boolean);
const PICK = String(opt('arms', '')).split(',').filter(Boolean);
const QUERY = opt('query', '');
const CENSUS = flag('census');
const TIMEOUT = +opt('timeout', 7200) * 1000;

/**
 * The arms. `scope` is documentation that the report reprints: an arm marked GLOBAL moves the
 * architecture too, so it can ATTRIBUTE but can never be a fix — the architecture is the
 * owner's reference for "correct" and §737 may not move it.
 */
const ARMS = [
  { id: 'A0', scope: '—', label: 'shipped (control)' },
  { id: 'I2', scope: '—', label: 'base captured a second time — instrument control, must be 0 px' },
  /* The two KNOWN-ANSWER controls §418.3 asks for, and they are in-arm rather than bolted on
     afterwards: an input the metric must FAIL to find chroma in, and one it must find plenty in.
     Both paint the prop bodies with a flat unlit colour and change nothing else, so they test
     the MASK and the STATISTIC at once — if a prop mask leaked onto the masonry beside it, the
     grey arm could not read near zero, and if the saturation formula were measuring the region
     rather than the object, neither arm could move only the PROP rows. */
  { id: 'CTLGREY', scope: 'PROPS', label: 'CONTROL(neg): prop bodies painted flat neutral grey — PROP sat must collapse, ARCH must not move' },
  { id: 'CTLSAT', scope: 'PROPS', label: 'CONTROL(pos): prop bodies painted flat saturated red — PROP sat must jump, ARCH must not move' },
  /* THE CONFOUND ARM, and the one that decides the curvature story. Hand-sampling a chest
     against a canopic jar cannot separate "this body is rounder" from "this body's patch of the
     atlas is a duller colour" — they are the same comparison. KKUNI gives every prop body the
     IDENTICAL albedo (map off, one flat warm) through the REAL toon material, so any saturation
     spread that survives is owned by geometry and shading alone. Without it, a per-object
     curvature correlation is a measurement of KayKit's texture atlas wearing a geometry label. */
  { id: 'KKUNI', scope: 'PROPS', label: 'CONFOUND: every prop body given ONE albedo (map off, flat 0xc08040) through the real shader' },
  /* §738's STRENGTH SWEEP. `uMatShadowHold` is per-material and is not republished per frame, so
     every strength is a direct pin on the three KayKit recipes and the whole sweep fits in one
     boot on one mask — which is the only way the arms can be compared per body at all. H000 is
     the pre-§738 state and is the row every other row is read against. */
  { id: 'H000', scope: 'PROPS', label: 'shade hold 0.00 — pre-§738, what ?kk=nohold restores' },
  { id: 'H015', scope: 'PROPS', label: 'shade hold 0.15' },
  { id: 'H025', scope: 'PROPS', label: 'shade hold 0.25' },
  { id: 'H035', scope: 'PROPS', label: 'shade hold 0.35' },
  { id: 'H050', scope: 'PROPS', label: 'shade hold 0.50' },
  { id: 'H070', scope: 'PROPS', label: 'shade hold 0.70' },
  { id: 'H100', scope: 'PROPS', label: 'shade hold 1.00 — full strength, §737.6 measured this as an overshoot' },
  { id: 'KKRIM0', scope: 'PROPS', label: 'uRim = 0 on the three KayKit recipes only — the surface fresnel rim' },
  { id: 'AMB0', scope: 'GLOBAL', label: 'uAmbIntensity = 0 — the hemispheric sky/bounce fill, everywhere' },
  { id: 'WASH0', scope: 'GLOBAL', label: 'uShadowWash = 0 — the albedo-INDEPENDENT additive shadow coat' },
  { id: 'SHADN', scope: 'GLOBAL', label: 'uNeutralShadow = 1 — shadow light chroma to luma-matched grey' },
  { id: 'FILLN', scope: 'GLOBAL', label: 'uNeutralFill = 1 — hemispheric fill chroma to luma-matched grey' },
  { id: 'BLOOM0', scope: 'GLOBAL', label: 'PostFX bloom pass disabled' },
  { id: 'PFXRIM0', scope: 'GLOBAL', label: 'PostFX screen-space silhouette rim strength = 0' },
  { id: 'HOLD1', scope: 'GLOBAL', label: 'uShadowHold = 1 — §269 shade-side albedo-chroma hold, which ships at 0 for everything but the character' },
  { id: 'I4', scope: '—', label: 'every pin released — must return to A0 at 0 px' },
];


function sha() {
  try { return execFileSync('git', ['rev-parse', '--short', 'HEAD'], { cwd: ROOT }).toString().trim(); }
  catch { return '(no git)'; }
}
async function freePort(start = 5760) {
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

/* ---------------------------------------------------------------------------------------- */

async function runShot(page, { shot, grades, arms, stride, census }) {
  return page.evaluate(async ({ shot, grades, arms, stride, census }) => {
    const G = window.__GAME, E = G.engine, T = G.THREE;
    const log = [];
    const out = { shot, log, grades: {} };

    /* `--census` skips staging entirely: a body's WORLD position does not depend on which camera
       is looking at it, and setShot costs 17 software-rendered frames. §738 needed this to answer
       "what IS props_kaykit#6" without paying four minutes of capture lock to find out — and
       needed to ANSWER it rather than infer it from a screen centroid, which is the whole lesson
       of §737. */
    if (!census) await G.setShot(shot);

    /* ---------------- census: who is in this frame, and under which recipe ---------------- */
    const KK = new Set(['kaykit:atlas', 'props:kaykit', 'smash:kaykit']);
    const targets = [], subj = [], refs = [];
    E.scene.traverse((o) => {
      if (!(o.isMesh || o.isSkinnedMesh || o.isInstancedMesh)) return;
      if (o.visible === false) return;
      /* Outline shells are back-face expanded copies. They are INVISIBLE from outside in the
         render (front faces culled) but a raycast hits them first, so a shell left in the
         target list would mask every object with a 3 mm skin of its own ink. */
      if (o.userData?.isOutlineShell || o.userData?.slyOutline || /outline|:ink/i.test(o.name || '')) return;
      targets.push(o);
      const mn = o.material?.name || '';
      if (KK.has(mn)) subj.push(o);
      else if (/^arch:/.test(mn)) refs.push(o);
    });
    out.census = {
      targets: targets.length, subj: subj.length, refs: refs.length,
      subjMats: [...new Set(subj.map((m) => m.material.name))],
      refMats: [...new Set(refs.map((m) => m.material.name))].slice(0, 20),
    };
    if (census) {
      out.subjNames = subj.map((m) => `${m.name || m.type}/${m.material.name}`).slice(0, 80);
      /* Per connected component: world centroid, world bbox and triangle count — the same
         component split the mask uses, so a body id here IS the body id there. */
      out.bodies = [];
      for (const mesh of subj) {
        const geo = mesh.geometry, pos = geo.attributes.position, idx = geo.index;
        const nv = pos.count;
        const map = new Map(); const weld = new Int32Array(nv);
        for (let i = 0; i < nv; i++) {
          const k = `${Math.round(pos.getX(i) * 1e4)},${Math.round(pos.getY(i) * 1e4)},${Math.round(pos.getZ(i) * 1e4)}`;
          let v = map.get(k); if (v === undefined) { v = map.size; map.set(k, v); } weld[i] = v;
        }
        const par = new Int32Array(map.size); for (let i = 0; i < par.length; i++) par[i] = i;
        const find = (a) => { while (par[a] !== a) { par[a] = par[par[a]]; a = par[a]; } return a; };
        const uni = (a, b) => { a = find(a); b = find(b); if (a !== b) par[b] = a; };
        const nTri = idx ? idx.count / 3 : nv / 3;
        for (let t = 0; t < nTri; t++) {
          const a = idx ? idx.getX(t * 3) : t * 3, b = idx ? idx.getX(t * 3 + 1) : t * 3 + 1, c = idx ? idx.getX(t * 3 + 2) : t * 3 + 2;
          uni(weld[a], weld[b]); uni(weld[b], weld[c]);
        }
        const comp = new Map();
        const v3 = new T.Vector3();
        for (let i = 0; i < nv; i++) {
          const r = find(weld[i]);
          let c = comp.get(r);
          if (!c) { c = { n: 0, x: 0, y: 0, z: 0, lo: [1e9, 1e9, 1e9], hi: [-1e9, -1e9, -1e9] }; comp.set(r, c); }
          v3.fromBufferAttribute(pos, i).applyMatrix4(mesh.matrixWorld);
          c.n++; c.x += v3.x; c.y += v3.y; c.z += v3.z;
          c.lo[0] = Math.min(c.lo[0], v3.x); c.lo[1] = Math.min(c.lo[1], v3.y); c.lo[2] = Math.min(c.lo[2], v3.z);
          c.hi[0] = Math.max(c.hi[0], v3.x); c.hi[1] = Math.max(c.hi[1], v3.y); c.hi[2] = Math.max(c.hi[2], v3.z);
        }
        let ci = 0;
        for (const c of comp.values()) {
          out.bodies.push({
            body: `${mesh.name || mesh.type}#${ci++}`, mat: mesh.material.name, verts: c.n,
            at: [+(c.x / c.n).toFixed(2), +(c.y / c.n).toFixed(2), +(c.z / c.n).toFixed(2)],
            size: [+(c.hi[0] - c.lo[0]).toFixed(2), +(c.hi[1] - c.lo[1]).toFixed(2), +(c.hi[2] - c.lo[2]).toFixed(2)],
          });
        }
      }
      return out;
    }

    /* ------------------------------- the mask -------------------------------------------- */
    /* Engine.camera IS the camera the frame is rendered with (Engine.js:156) — the same object,
       not a reconstruction from the shot spec, so the mask registers with the pixels by
       identity rather than by agreement.

       HOW THE MASK IS TAKEN, and why not by raycasting. The first version of this instrument
       cast the shot camera through the live scene with THREE.Raycaster. It is correct and it is
       unusable: no BVH is installed, so every ray tests every triangle of every candidate mesh,
       and a 160x90 grid took 317 s — 84 minutes at the resolution this lane actually needs.
       Worse, it could not have answered the question anyway: KayKit merges its 36 placements
       into THREE meshes (KayKit.js:716, the same merge strategy Architecture uses against §1's
       draw budget), so a per-MESH mask is a per-POPULATION mask wearing a per-object label —
       §442's defect, rebuilt by me, one round after reading §442.

       So the mask is taken on the GPU, in two extra renders, and the bodies are separated by
       CONNECTED COMPONENT of the merged geometry rather than by mesh:

         · ID pass — every mesh swapped for a flat MeshBasicMaterial carrying its own id, the
           three merged prop meshes carrying a per-VERTEX id so each welded body reads as its
           own object. Rendered to a linear byte target with toneMapped false, so the value read
           back is the value written. Ids are spaced 4/255 apart per channel, which is wider than
           any rounding this path can introduce.
         · NORMAL pass — scene.overrideMaterial = MeshNormalMaterial, giving the INTERPOLATED
           view-space shading normal at every pixel: the same normal the toon shader's fresnel
           consumes. A flat face normal would report a smooth-shaded barrel as a set of panels
           and invert the curvature column this lane turns on.

       Both passes bypass PostFX entirely (direct renderer.render to a target), so neither the
       tonemap nor bloom can move an id or a normal. */
    const CAM = E.camera;
    if (!CAM?.isCamera) { out.error = 'no engine camera'; return out; }
    CAM.updateMatrixWorld(true);
    const RW = E.canvas.width, RH = E.canvas.height;
    const gw = Math.floor(RW / stride), gh = Math.floor(RH / stride);

    /* Weld by quantised position and union-find the triangles: one component per placed body.
       Quantised at 1e-4 m — KayKit's own bodies stand metres apart, so nothing but a genuinely
       shared vertex can collide at 0.1 mm. */
    const componentsOf = (geo) => {
      const pos = geo.attributes.position, idx = geo.index;
      const nv = pos.count;
      const weld = new Int32Array(nv);
      const map = new Map();
      for (let i = 0; i < nv; i++) {
        const k = `${Math.round(pos.getX(i) * 1e4)},${Math.round(pos.getY(i) * 1e4)},${Math.round(pos.getZ(i) * 1e4)}`;
        let v = map.get(k);
        if (v === undefined) { v = map.size; map.set(k, v); }
        weld[i] = v;
      }
      const parent = new Int32Array(map.size);
      for (let i = 0; i < parent.length; i++) parent[i] = i;
      const find = (a) => { while (parent[a] !== a) { parent[a] = parent[parent[a]]; a = parent[a]; } return a; };
      const uni = (a, b) => { a = find(a); b = find(b); if (a !== b) parent[b] = a; };
      const nTri = idx ? idx.count / 3 : nv / 3;
      for (let t = 0; t < nTri; t++) {
        const a = idx ? idx.getX(t * 3) : t * 3, b = idx ? idx.getX(t * 3 + 1) : t * 3 + 1, c = idx ? idx.getX(t * 3 + 2) : t * 3 + 2;
        uni(weld[a], weld[b]); uni(weld[b], weld[c]);
      }
      const root2comp = new Map();
      const comp = new Int32Array(nv);
      for (let i = 0; i < nv; i++) {
        const r = find(weld[i]);
        let c = root2comp.get(r);
        if (c === undefined) { c = root2comp.size; root2comp.set(r, c); }
        comp[i] = c;
      }
      return { comp, n: root2comp.size };
    };

    const objects = [];
    const enc = (id) => {                       // id -> a colour 4/255 apart on every channel
      const r = (id % 64) * 4, g = (((id / 64) | 0) % 64) * 4, b = (((id / 4096) | 0) % 64) * 4;
      return [r / 255, g / 255, b / 255];
    };
    const decode = (r, g, b) => Math.round(r / 4) + Math.round(g / 4) * 64 + Math.round(b / 4) * 4096;

    const saved = [];                            // [mesh, material, visible, colorAttr]
    const tmpMats = [];
    const vcMat = new T.MeshBasicMaterial({ vertexColors: true, toneMapped: false, fog: false });
    tmpMats.push(vcMat);
    let hidden = 0;

    E.scene.traverse((o) => {
      if (!(o.isMesh || o.isSkinnedMesh || o.isInstancedMesh)) return;
      const shell = o.userData?.isOutlineShell || o.userData?.slyOutline || /outline|:ink/i.test(o.name || '');
      /* Ink shells are back-face expanded copies drawn OUTSIDE the body. In the beauty frame
         their front faces are culled; in a flat ID pass they are not, so a shell left visible
         would paint its own id over every object it wraps. Transparent FX (dust, shafts) are
         hidden too, so the body BEHIND owns the pixel — the contamination that leaves in the
         beauty frame is identical in every arm (I2 proves the frame is static at dt 0), so it
         cannot bias an attribution, only an absolute. */
      const fx = o.material && o.material.transparent === true;
      if (!o.visible) return;
      saved.push([o, o.material, o.visible, o.geometry.attributes.color || null]);
      if (shell || fx) { o.visible = false; hidden++; return; }
      const mn = o.material?.name || '';
      if (KK.has(mn)) {
        const cc = componentsOf(o.geometry);
        const base = objects.length;
        for (let c = 0; c < cc.n; c++) objects.push({ id: base + c, mesh: `${o.name || o.type}#${c}`, mat: mn, pop: 'PROP' });
        const col = new Float32Array(o.geometry.attributes.position.count * 3);
        for (let i = 0; i < cc.comp.length; i++) {
          const e = enc(base + cc.comp[i]);
          col[i * 3] = e[0]; col[i * 3 + 1] = e[1]; col[i * 3 + 2] = e[2];
        }
        o.geometry.setAttribute('color', new T.BufferAttribute(col, 3));
        o.material = vcMat;
      } else {
        const id = objects.length;
        objects.push({
          id, mesh: o.name || o.type, mat: mn,
          pop: /^arch:/.test(mn) ? 'ARCH' : (o.isSkinnedMesh ? 'CHAR' : 'OTHER'),
        });
        const e = enc(id);
        const m = new T.MeshBasicMaterial({ toneMapped: false, fog: false });
        m.color.setRGB(e[0], e[1], e[2]);
        tmpMats.push(m);
        o.material = m;
      }
    });
    log.push(`mask: ${objects.length} objects (${objects.filter((o) => o.pop === 'PROP').length} prop bodies), ${hidden} shells/fx hidden`);

    const rt = new T.WebGLRenderTarget(RW, RH, { type: T.UnsignedByteType, colorSpace: T.LinearSRGBColorSpace, samples: 0 });
    const buf = new Uint8Array(RW * RH * 4);
    const R = E.renderer;
    const prevRT = R.getRenderTarget();
    /* Every piece of renderer/scene state these two passes touch is saved and put back. A
       harness that leaves the clear colour or the scene background moved renders every arm
       AFTER it against a different world than the one on disk, and nothing in the arm table
       would say so — the I4 control is what catches it, but only if the restore is attempted. */
    const prevClear = new T.Color(); R.getClearColor(prevClear);
    const prevClearA = R.getClearAlpha();
    const prevBg = E.scene.background;
    E.scene.background = null;
    R.setRenderTarget(rt);
    R.setClearColor(0x000000, 1); R.clear();
    R.render(E.scene, CAM);
    R.readRenderTargetPixels(rt, 0, 0, RW, RH, buf);

    const nbuf = new Uint8Array(RW * RH * 4);
    const nMat = new T.MeshNormalMaterial();
    tmpMats.push(nMat);
    E.scene.overrideMaterial = nMat;
    R.clear();
    R.render(E.scene, CAM);
    R.readRenderTargetPixels(rt, 0, 0, RW, RH, nbuf);
    E.scene.overrideMaterial = null;
    R.setRenderTarget(prevRT);
    R.setClearColor(prevClear, prevClearA);
    E.scene.background = prevBg;

    /* Restore before anything else runs. The I4 arm re-proves this against the base frame. */
    for (const [o, mat, vis, colAttr] of saved) {
      o.material = mat; o.visible = vis;
      if (colAttr) o.geometry.setAttribute('color', colAttr); else o.geometry.deleteAttribute('color');
    }
    for (const m of tmpMats) m.dispose();
    rt.dispose();

    /* Decode. readRenderTargetPixels hands back rows BOTTOM-UP (the GL convention), so the row
       index is flipped here; getting this wrong produces a mask that is a mirror of the frame
       and lands every sample on the wrong object while still looking like a plausible mask. */
    const ids = new Int32Array(gw * gh).fill(-1);
    const nrm = new Int8Array(gw * gh * 3);
    const fres = new Uint8Array(gw * gh);
    const P = CAM.projectionMatrix.elements;
    const p00 = P[0], p11 = P[5];
    const seen = new Set();
    for (let gy = 0; gy < gh; gy++) {
      for (let gx = 0; gx < gw; gx++) {
        const px = gx * stride, py = gy * stride;
        const src = ((RH - 1 - py) * RW + px) * 4;
        const gi = gy * gw + gx;
        const id = decode(buf[src], buf[src + 1], buf[src + 2]);
        if (id <= 0 && buf[src] + buf[src + 1] + buf[src + 2] === 0) continue;   // cleared = sky
        if (id >= objects.length) continue;
        ids[gi] = id; seen.add(id);
        /* MeshNormalMaterial writes the VIEW-space interpolated normal as n*0.5+0.5. The view
           ray for this pixel comes back out of the projection matrix, so N.V is exact rather
           than approximated from the world camera position. */
        const nx = (nbuf[src] / 255) * 2 - 1, ny = (nbuf[src + 1] / 255) * 2 - 1, nz = (nbuf[src + 2] / 255) * 2 - 1;
        const nl = Math.hypot(nx, ny, nz) || 1;
        nrm[gi * 3] = Math.max(-127, Math.min(127, Math.round((nx / nl) * 127)));
        nrm[gi * 3 + 1] = Math.max(-127, Math.min(127, Math.round((ny / nl) * 127)));
        nrm[gi * 3 + 2] = Math.max(-127, Math.min(127, Math.round((nz / nl) * 127)));
        const ndcx = (px / RW) * 2 - 1, ndcy = -((py / RH) * 2 - 1);
        let vx = ndcx / p00, vy = ndcy / p11, vz = -1;
        const vl = Math.hypot(vx, vy, vz); vx /= vl; vy /= vl; vz /= vl;
        const ndv = Math.abs((nx * vx + ny * vy + nz * vz) / nl);
        fres[gi] = Math.max(0, Math.min(255, Math.round(Math.pow(1 - ndv, 3.1) * 255)));
      }
    }
    log.push(`mask: ${gw}x${gh} grid (stride ${stride}), ${seen.size} objects visible of ${objects.length}`);

    const b64 = (buf2) => {
      const u8 = new Uint8Array(buf2.buffer, buf2.byteOffset, buf2.byteLength);
      let s = '';
      for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000));
      return btoa(s);
    };
    out.mask = { shot, w: RW, h: RH, stride, gw, gh, objects, ids: b64(ids), nrm: b64(nrm), fres: b64(fres) };

    /* --------------------------------- the arms ------------------------------------------ */
    const shading = E.get('shading');
    const postfx = E.get('postfx');
    const kkMats = [...new Set(subj.map((m) => m.material))];
    out.kkMats = kkMats.map((m) => `${m.name} rim=${m.userData?.slyUniforms?.uRim?.value ?? 'MISSING'} hold=${m.userData?.slyUniforms?.uMatShadowHold?.value ?? 'MISSING'}`);

    /* Pin a uniform's `.value` so a per-frame republish cannot overwrite it. Assignment is not
       enough: uAmbIntensity is rewritten by `setKeyLight` on every publish, and a harness that
       assigns to it renders one thing while reporting another (§736's uRimGain trap). */
    const pins = [];
    const pin = (u, v) => {
      if (!u) return;
      const orig = u.value;
      Object.defineProperty(u, 'value', { get: () => v, set: () => {}, configurable: true });
      pins.push(() => Object.defineProperty(u, 'value', { value: orig, writable: true, configurable: true }));
    };
    const release = () => { while (pins.length) pins.pop()(); };

    const ctlMats = [];
    const ctlSaved = [];
    const uniSaved = [];
    const ununi = () => {
      while (uniSaved.length) {
        const [m, map, col] = uniSaved.pop();
        m.map = map; m.color.copy(col); m.needsUpdate = true;
      }
    };
    const paintProps = (hex) => {
      const m = new T.MeshBasicMaterial({ color: hex, fog: false });
      ctlMats.push(m);
      for (const mesh of subj) { ctlSaved.push([mesh, mesh.material]); mesh.material = m; }
    };
    const unpaint = () => {
      while (ctlSaved.length) { const [mesh, mat] = ctlSaved.pop(); mesh.material = mat; }
      while (ctlMats.length) ctlMats.pop().dispose();
    };

    const applyArm = (id) => {
      if (id === 'CTLGREY') paintProps(0x808080);
      else if (id === 'CTLSAT') paintProps(0xd01e10);
      else if (id === 'KKUNI') {
        for (const m of kkMats) {
          uniSaved.push([m, m.map, m.color.clone()]);
          m.map = null; m.color.setHex(0xc08040); m.needsUpdate = true;
        }
      }
      else if (/^H\d{3}$/.test(id)) {
        const v = Number(id.slice(1)) / 100;
        for (const m of kkMats) pin(m.userData?.slyUniforms?.uMatShadowHold, v);
      }
      else if (id === 'KKRIM0') for (const m of kkMats) pin(m.userData?.slyUniforms?.uRim, 0);
      else if (id === 'AMB0') pin(shading?.uniforms?.uAmbIntensity, 0);
      else if (id === 'WASH0') pin(shading?.uniforms?.uShadowWash, 0);
      else if (id === 'SHADN') pin(shading?.uniforms?.uNeutralShadow, 1);
      else if (id === 'FILLN') pin(shading?.uniforms?.uNeutralFill, 1);
      else if (id === 'HOLD1') pin(shading?.uniforms?.uShadowHold, 1);
      else if (id === 'BLOOM0') postfx?.setEnabled?.('bloom', false);
      else if (id === 'PFXRIM0') { if (postfx?.tune) postfx.tune.rimStrength = 0; }
    };
    const RIM_SHIP = postfx?.tune ? postfx.tune.rimStrength : null;
    const undoArm = (id) => {
      release();
      unpaint();
      ununi();
      if (id === 'BLOOM0') postfx?.setEnabled?.('bloom', true);
      if (id === 'PFXRIM0' && postfx?.tune && RIM_SHIP != null) postfx.tune.rimStrength = RIM_SHIP;
    };

    for (const gname of grades) {
      const dbg = E.get('debug');
      const tod = gname === 'night' ? ((dbg && typeof dbg._dnNight === 'number') ? dbg._dnNight : 0.02) : null;
      if (tod != null) { G.setTimeOfDay(tod); await G.step(6, 0); }
      const g = { grade: gname, tod, pngs: {} };
      for (const a of arms) {
        applyArm(a.id);
        /* Three frames for the arms that change a DEFINE rather than a uniform: dropping `map`
           recompiles the program and SwiftShader compiles lazily on first draw, so a two-frame
           settle can capture the frame before the new program is live. */
        await G.step(a.id === 'KKUNI' ? 4 : 2, 0);
        g.pngs[a.id] = G.capture();
        undoArm(a.id);
      }
      out.grades[gname] = g;
      /* Put the shot's own time-of-day back after the night pass.
         `{ dt: 0 }` — §251 / tests/clockfreeze.test.mjs. Every capture in this file is already
         phase-aligned: the arms advance through `G.step(n, 0)`, which freezes the world clock
         positionally, and the I2 control reads 0.000 in all four grade-frames because of it. But
         a positional `0` DECLARES nothing a reader or a scan can see, and this restage was the
         one call in the file that really did let the clock run. Frozen here as well, so the day
         and night arms of a shot now sit on ONE animation phase rather than two. */
      if (tod != null) { await G.setShot(shot, { dt: 0 }); }
    }
    return out;
  }, { shot, grades, arms, stride, census });
}

/* ---------------------------------------------------------------------------------------- */

async function main() {
  await mkdir(OUTDIR, { recursive: true });
  const arms = PICK.length ? ARMS.filter((a) => PICK.includes(a.id)) : ARMS;
  process.stdout.write(`· kkbleach @ ${sha()}  shots=${SHOTS.join(',')} grades=${GRADES.join(',')} arms=${arms.map((a) => a.id).join(',')}\n`);

  const release = await acquire({ onWait: (ms, pid) => process.stdout.write(`· waiting for capture lock (${(ms / 1000) | 0}s, pid ${pid})\n`) });
  process.on('exit', release);
  const port = await freePort();
  const server = await startServer(port);
  process.stdout.write(`· dev server :${port}\n`);
  const CHROME = process.env.CHROME_PATH
    || ['/opt/pw-browsers/chromium', '/usr/bin/chromium', '/usr/bin/chromium-browser'].find((p) => existsSync(p));
  const browser = await chromium.launch({
    executablePath: CHROME,
    args: ['--no-sandbox', '--disable-dev-shm-usage', '--use-gl=angle', '--use-angle=swiftshader',
      '--enable-unsafe-swiftshader', '--enable-webgl', '--ignore-gpu-blocklist',
      '--disable-frame-rate-limit', '--js-flags=--max-old-space-size=4096',
      '--force-device-scale-factor=1', '--hide-scrollbars', '--mute-audio'],
  });
  const report = { at: new Date().toISOString(), sha: sha(), w: W, h: H, stride: STRIDE, arms, shots: {} };
  try {
    const ctx = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
    const page = await ctx.newPage();
    const errs = [];
    page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
    page.on('pageerror', (e) => errs.push(`pageerror: ${e.message}`));
    await page.goto(`http://127.0.0.1:${port}/?shot=1&q=high${QUERY ? `&${QUERY}` : ''}`, { waitUntil: 'domcontentloaded', timeout: 90000 });
    await page.waitForFunction('window.__GAME && window.__GAME.ready === true', null, { timeout: TIMEOUT, polling: 500 });
    process.stdout.write('· ready\n');

    for (const shot of SHOTS) {
      const t0 = Date.now();
      process.stdout.write(`· ${shot}: staging + mask\n`);
      const res = await runShot(page, { shot, grades: GRADES, arms, stride: STRIDE, census: CENSUS });
      for (const l of res.log || []) process.stdout.write(`    ${l}\n`);
      process.stdout.write(`    census: ${res.census.targets} targets, ${res.census.subj} prop meshes ${JSON.stringify(res.census.subjMats)}, ${res.census.refs} arch meshes\n`);
      if (res.subjNames) for (const n of res.subjNames) process.stdout.write(`      · ${n}\n`);
      if (CENSUS) {
        for (const b of (res.bodies || [])) {
          process.stdout.write(`      ${b.body.padEnd(20)} ${b.mat.padEnd(14)} v${String(b.verts).padStart(5)}  at (${b.at.join(', ')})  size ${b.size.join(' x ')}\n`);
        }
        report.shots[shot] = { census: res.census, names: res.subjNames, bodies: res.bodies };
        continue;
      }
      if (res.kkMats) process.stdout.write(`    kk materials: ${res.kkMats.join(' ')}\n`);

      await writeFile(path.join(OUTDIR, `${shot}.mask.json`), JSON.stringify(res.mask));
      const shotRec = { mask: `${shot}.mask.json`, grades: {} };
      for (const [g, gr] of Object.entries(res.grades)) {
        shotRec.grades[g] = { tod: gr.tod, pngs: {} };
        for (const [aid, png] of Object.entries(gr.pngs)) {
          const f = `${shot}-${g}-${aid}.png`;
          await writeFile(path.join(OUTDIR, f), Buffer.from(png.split(',')[1], 'base64'));
          shotRec.grades[g].pngs[aid] = f;
        }
      }
      report.shots[shot] = shotRec;
      process.stdout.write(`  ✓ ${shot} in ${((Date.now() - t0) / 1000).toFixed(0)}s\n`);
      await writeFile(path.join(OUTDIR, 'report.json'), JSON.stringify(report, null, 2));
    }
    report.consoleErrors = errs.slice(0, 30);
    if (errs.length) process.stdout.write(`· ${errs.length} console error(s): ${errs[0]?.split('\n')[0]}\n`);
  } finally {
    await browser.close().catch(() => {});
    server.kill('SIGTERM'); setTimeout(() => server.kill('SIGKILL'), 3000);
    await writeFile(path.join(OUTDIR, 'report.json'), JSON.stringify(report, null, 2));
  }
  process.stdout.write(`\n→ ${path.relative(ROOT, OUTDIR)}/\n`);
  process.exit(0);
}
main().catch((e) => { console.error('\nkkbleach failed:', e.stack || e.message); process.exit(1); });

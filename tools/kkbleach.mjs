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
 *   node tools/kkbleach.mjs --shots interior --grades day,night
 *   node tools/kkbleach.mjs --census            # boot, census, ray timing, exit (no arms)
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
  { id: 'KKRIM0', scope: 'PROPS', label: 'uRim = 0 on the three KayKit recipes only' },
  { id: 'KKSPEC0', scope: 'PROPS', label: 'uSpec = 0 on the KayKit recipes only' },
  { id: 'KKSSS0', scope: 'PROPS', label: 'uSss = 0 on the KayKit recipes only' },
  { id: 'AMB0', scope: 'GLOBAL', label: 'uAmbIntensity = 0 — the hemispheric sky/bounce fill, everywhere' },
  { id: 'BLOOM0', scope: 'GLOBAL', label: 'PostFX bloom pass disabled' },
  { id: 'PFXRIM0', scope: 'GLOBAL', label: 'PostFX screen-space silhouette rim strength = 0' },
  { id: 'ALLRIM0', scope: 'GLOBAL', label: 'uRim = 0 on EVERY toon material + PostFX rim 0 — the ceiling of the rim story' },
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

    await G.setShot(shot);

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
      return out;
    }

    /* ------------------------------- the mask -------------------------------------------- */
    /* Engine.camera IS the camera the frame is rendered with (Engine.js:156) — the same object,
       not a reconstruction from the shot spec, so the mask registers with the pixels by
       identity rather than by agreement. */
    const CAM = E.camera;
    if (!CAM?.isCamera) { out.error = 'no engine camera'; return out; }
    CAM.updateMatrixWorld(true);
    CAM.updateProjectionMatrix();
    const W = E.canvas.width, Hh = E.canvas.height;
    const gw = Math.floor(W / stride), gh = Math.floor(Hh / stride);

    /* Screen-space AABB per target, so each ray tests only the handful of objects whose box
       covers its tile. Without this the grid is 230k rays x 200 objects and the boot times out. */
    const _v = new T.Vector3();
    const boxOf = (o) => {
      let bb = null;
      if (o.isInstancedMesh) { if (!o.boundingBox) o.computeBoundingBox(); bb = o.boundingBox?.clone(); }
      if (!bb) { if (!o.geometry.boundingBox) o.geometry.computeBoundingBox(); bb = o.geometry.boundingBox?.clone(); }
      if (!bb) return null;
      bb.applyMatrix4(o.matrixWorld);
      let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9, anyFront = false;
      for (let i = 0; i < 8; i++) {
        _v.set(i & 1 ? bb.max.x : bb.min.x, i & 2 ? bb.max.y : bb.min.y, i & 4 ? bb.max.z : bb.min.z);
        const vv = _v.clone().applyMatrix4(CAM.matrixWorldInverse);
        if (vv.z < 0) anyFront = true;
        _v.project(CAM);
        /* A corner BEHIND the eye projects to a mirrored, meaningless point. Any box that
           straddles the near plane gets the whole frame rather than a wrong rectangle — the
           cheap correct answer, and it only costs rays on the few objects it applies to. */
        if (vv.z >= 0) { x0 = -1; y0 = -1; x1 = 1; y1 = 1; break; }
        x0 = Math.min(x0, _v.x); x1 = Math.max(x1, _v.x);
        y0 = Math.min(y0, _v.y); y1 = Math.max(y1, _v.y);
      }
      if (!anyFront) return null;
      const gx0 = Math.max(0, Math.floor(((x0 + 1) / 2) * gw) - 1);
      const gx1 = Math.min(gw - 1, Math.ceil(((x1 + 1) / 2) * gw) + 1);
      const gy1 = Math.min(gh - 1, Math.ceil(((1 - y0) / 2) * gh) + 1);
      const gy0 = Math.max(0, Math.floor(((1 - y1) / 2) * gh) - 1);
      if (gx1 < gx0 || gy1 < gy0) return null;
      return [gx0, gy0, gx1, gy1];
    };

    const TS = 16;                                     // tile size, in grid cells
    const tx = Math.ceil(gw / TS), ty = Math.ceil(gh / TS);
    const tiles = Array.from({ length: tx * ty }, () => []);
    let boxed = 0;
    for (const o of targets) {
      const b = boxOf(o);
      if (!b) continue;
      boxed++;
      for (let t = (b[1] / TS) | 0; t <= (b[3] / TS) | 0; t++) {
        for (let s = (b[0] / TS) | 0; s <= (b[2] / TS) | 0; s++) tiles[t * tx + s].push(o);
      }
    }
    log.push(`mask: ${gw}x${gh} grid (stride ${stride}), ${boxed}/${targets.length} targets boxed, ${tx}x${ty} tiles`);

    const ids = new Int32Array(gw * gh).fill(-1);
    const nrm = new Int8Array(gw * gh * 3);
    const fres = new Uint8Array(gw * gh);
    const objIndex = new Map();                        // mesh -> id
    const objects = [];
    const rc = new T.Raycaster();
    const ndc = new T.Vector2();
    const tri = new T.Triangle();
    const bc = new T.Vector3();
    const na = new T.Vector3(), nb = new T.Vector3(), nc = new T.Vector3();
    const pa = new T.Vector3(), pb = new T.Vector3(), pc = new T.Vector3();
    const nOut = new T.Vector3();
    const m4 = new T.Matrix4();
    const lp = new T.Vector3();

    /* The shader consumes the INTERPOLATED normal; a flat face normal reports a faceted barrel
       as a set of flat panels and would make the curvature column report the opposite of the
       truth on exactly the bodies this lane is about. */
    const normalAt = (hit) => {
      const o = hit.object, g = o.geometry;
      const f = hit.face;
      if (!f) return null;
      m4.copy(o.matrixWorld);
      if (hit.instanceId != null && o.isInstancedMesh) {
        const im = new T.Matrix4(); o.getMatrixAt(hit.instanceId, im); m4.multiply(im);
      }
      const nAttr = g.attributes.normal;
      if (!nAttr || o.material?.flatShading) {
        return nOut.copy(f.normal).transformDirection(m4).normalize().clone();
      }
      pa.fromBufferAttribute(g.attributes.position, f.a);
      pb.fromBufferAttribute(g.attributes.position, f.b);
      pc.fromBufferAttribute(g.attributes.position, f.c);
      lp.copy(hit.point).applyMatrix4(m4.clone().invert());
      tri.set(pa, pb, pc);
      if (!tri.getBarycoord(lp, bc)) return nOut.copy(f.normal).transformDirection(m4).normalize().clone();
      na.fromBufferAttribute(nAttr, f.a); nb.fromBufferAttribute(nAttr, f.b); nc.fromBufferAttribute(nAttr, f.c);
      nOut.set(0, 0, 0).addScaledVector(na, bc.x).addScaledVector(nb, bc.y).addScaledVector(nc, bc.z);
      if (nOut.lengthSq() < 1e-9) nOut.copy(f.normal);
      return nOut.transformDirection(m4).normalize().clone();
    };

    /* uRimPower is per-material; fres = pow(1 - N.V, uRimPower) is the shader's own line. */
    const rimPowerOf = (o) => o.material?.userData?.slyUniforms?.uRimPower?.value ?? 3.1;

    const t0 = performance.now();
    let cast = 0, hitN = 0;
    for (let gy = 0; gy < gh; gy++) {
      for (let gx = 0; gx < gw; gx++) {
        const cand = tiles[((gy / TS) | 0) * tx + ((gx / TS) | 0)];
        if (!cand.length) continue;
        const px = gx * stride, py = gy * stride;
        ndc.set((px / W) * 2 - 1, -((py / Hh) * 2 - 1));
        rc.setFromCamera(ndc, CAM);
        cast++;
        const hits = rc.intersectObjects(cand, false);
        if (!hits.length) continue;
        const h = hits[0];
        const n = normalAt(h);
        if (!n) continue;
        hitN++;
        let id = objIndex.get(h.object);
        if (id == null) {
          id = objects.length;
          objIndex.set(h.object, id);
          const mn = h.object.material?.name || '(none)';
          objects.push({
            id, mesh: h.object.name || h.object.type, mat: mn,
            pop: KK.has(mn) ? 'PROP' : (/^arch:/.test(mn) ? 'ARCH' : (h.object.isSkinnedMesh ? 'CHAR' : 'OTHER')),
          });
        }
        const gi = gy * gw + gx;
        ids[gi] = id;
        nrm[gi * 3] = Math.max(-127, Math.min(127, Math.round(n.x * 127)));
        nrm[gi * 3 + 1] = Math.max(-127, Math.min(127, Math.round(n.y * 127)));
        nrm[gi * 3 + 2] = Math.max(-127, Math.min(127, Math.round(n.z * 127)));
        const vdir = h.point.clone().sub(CAM.position).normalize();
        const ndv = Math.abs(n.dot(vdir));
        fres[gi] = Math.max(0, Math.min(255, Math.round(Math.pow(1 - ndv, rimPowerOf(h.object)) * 255)));
      }
    }
    log.push(`mask: ${cast} rays, ${hitN} hits, ${objects.length} objects, ${((performance.now() - t0) / 1000).toFixed(1)}s`);

    const b64 = (buf) => {
      const u8 = new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength);
      let s = '';
      for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000));
      return btoa(s);
    };
    out.mask = {
      shot, w: W, h: Hh, stride, gw, gh, objects,
      ids: b64(ids), nrm: b64(nrm), fres: b64(fres),
    };

    /* --------------------------------- the arms ------------------------------------------ */
    const shading = E.get('shading');
    const postfx = E.get('postfx');
    const kkMats = [...new Set(subj.map((m) => m.material))];
    const allMats = shading?._cache ? [...shading._cache.values()] : kkMats;
    out.kkMats = kkMats.map((m) => `${m.name}#${(m.userData?.slyUniforms?.uRim?.value ?? -1)}`);

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

    const applyArm = (id) => {
      if (id === 'KKRIM0') for (const m of kkMats) pin(m.userData?.slyUniforms?.uRim, 0);
      else if (id === 'KKSPEC0') for (const m of kkMats) pin(m.userData?.slyUniforms?.uSpec, 0);
      else if (id === 'KKSSS0') for (const m of kkMats) pin(m.userData?.slyUniforms?.uSss, 0);
      else if (id === 'AMB0') pin(shading?.uniforms?.uAmbIntensity, 0);
      else if (id === 'BLOOM0') postfx?.setEnabled?.('bloom', false);
      else if (id === 'PFXRIM0') { if (postfx?.tune) postfx.tune.rimStrength = 0; }
      else if (id === 'ALLRIM0') {
        for (const m of allMats) pin(m.userData?.slyUniforms?.uRim, 0);
        if (postfx?.tune) postfx.tune.rimStrength = 0;
      }
    };
    const RIM_SHIP = postfx?.tune ? postfx.tune.rimStrength : null;
    const undoArm = (id) => {
      release();
      if (id === 'BLOOM0') postfx?.setEnabled?.('bloom', true);
      if ((id === 'PFXRIM0' || id === 'ALLRIM0') && postfx?.tune && RIM_SHIP != null) postfx.tune.rimStrength = RIM_SHIP;
    };

    for (const gname of grades) {
      const dbg = E.get('debug');
      const tod = gname === 'night' ? ((dbg && typeof dbg._dnNight === 'number') ? dbg._dnNight : 0.02) : null;
      if (tod != null) { G.setTimeOfDay(tod); await G.step(6, 0); }
      const g = { grade: gname, tod, pngs: {} };
      for (const a of arms) {
        applyArm(a.id);
        await G.step(2, 0);
        g.pngs[a.id] = G.capture();
        undoArm(a.id);
      }
      out.grades[gname] = g;
      /* Put the clock back so the next grade starts from the shipped one rather than from
         whatever the previous grade left, and so `interior`'s own tod is restored for A0. */
      if (tod != null) { await G.setShot(shot); }
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
      if (CENSUS) { report.shots[shot] = { census: res.census, names: res.subjNames }; continue; }
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

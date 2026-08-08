/**
 * decalsign — does the contact decal darken the floor, or brighten it?
 *
 * Runs the four arms and five calibration arms sealed in `PREREG-decalsign.md`, in ONE boot on
 * `courtyard` (35 in-frame contact decals, the most of any canonical shot).
 *
 *   node progress/records/decalsign.mjs [--shot courtyard] [--w 1280] [--h 720] [--q high]
 *
 * Arms, in order:
 *   CLEAN   the material exactly as it ships — console window for CR-3, GL readback for CAL-3
 *   A1      premultipliedAlpha = false  (today's shipped material, bit-for-bit)
 *   A2      premultipliedAlpha = true   (the fix)
 *   A3      A2 again — the §220 null arm
 *   A4      debug.decalScale = 0        (a true off arm)
 *   CAL-1   a synthetic multiply over a known grey, which MUST darken
 *
 * Every arm goes through `__GAME.setShot()` because a bare `step(n, 0)` does not render (§218).
 * Masks are computed from the real instanced attributes, the real uniforms and the live camera,
 * by running the JS mirror of the vertex shader — never from a guessed screen position.
 */
import { withGame, ROOT } from '../../tools/harness.mjs';
import { applyFix } from './decalsign-fix.mjs';
import { writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { PNG } from 'pngjs';

const argv = process.argv.slice(2);
const opt = (n, d) => { const i = argv.indexOf(`--${n}`); if (i < 0) return d; const v = argv[i + 1]; argv.splice(i, 2); return v; };
const SHOT = opt('shot', 'courtyard');
const W = parseInt(opt('w', '1280'), 10);
const H = parseInt(opt('h', '720'), 10);
const Q = opt('q', 'high');
const OUT = opt('out', path.join(ROOT, 'progress/records/decalsign'));
mkdirSync(OUT, { recursive: true });

const WARN_RE = /MultiplyBlending requires material\.premultipliedAlpha/;

/* ----------------------------------------------------------------------------------------- */
/* in-page helpers, injected as source so they can be reused by several evaluate() calls        */
/* ----------------------------------------------------------------------------------------- */

/** Set premultipliedAlpha on every contact-decal material in the build. */
const SET_PREMUL = (v) => {
  const e = window.__GAME.engine;
  const out = [];
  for (const key of ['props', 'kaykit']) {
    const d = e.get(key)?.decals;
    if (!d?.material) continue;
    d.material.premultipliedAlpha = v;
    d.material.needsUpdate = true;
    out.push(key);
  }
  return out;
};

/** Install a GL blend-state probe in the decal mesh's own onAfterRender (CAL-3, §40). */
const INSTALL_PROBE = () => {
  const e = window.__GAME.engine;
  const gl = e.renderer.getContext();
  const names = {};
  for (const k of ['ZERO','ONE','SRC_COLOR','ONE_MINUS_SRC_COLOR','SRC_ALPHA','ONE_MINUS_SRC_ALPHA',
                   'DST_ALPHA','ONE_MINUS_DST_ALPHA','DST_COLOR','ONE_MINUS_DST_COLOR','SRC_ALPHA_SATURATE',
                   'CONSTANT_COLOR','ONE_MINUS_CONSTANT_COLOR','CONSTANT_ALPHA','ONE_MINUS_CONSTANT_ALPHA']) {
    names[gl[k]] = k;
  }
  window.__DECALPROBE = { draws: 0, before: null, after: null };
  for (const key of ['props', 'kaykit']) {
    const d = e.get(key)?.decals;
    if (!d?.mesh || d.mesh.userData.__probed) continue;
    const mesh = d.mesh;
    mesh.userData.__probed = true;
    const ob = mesh.onBeforeRender, oa = mesh.onAfterRender;
    const read = () => ({
      srcRGB: names[gl.getParameter(gl.BLEND_SRC_RGB)] ?? gl.getParameter(gl.BLEND_SRC_RGB),
      dstRGB: names[gl.getParameter(gl.BLEND_DST_RGB)] ?? gl.getParameter(gl.BLEND_DST_RGB),
      srcA:   names[gl.getParameter(gl.BLEND_SRC_ALPHA)] ?? gl.getParameter(gl.BLEND_SRC_ALPHA),
      dstA:   names[gl.getParameter(gl.BLEND_DST_ALPHA)] ?? gl.getParameter(gl.BLEND_DST_ALPHA),
      enabled: gl.isEnabled(gl.BLEND),
    });
    mesh.onBeforeRender = function (r, s, c, g, m) {
      if (ob) ob.call(this, r, s, c, g, m);
      if (m === d.material) window.__DECALPROBE.before = read();
    };
    mesh.onAfterRender = function (r, s, c, g, m) {
      if (m === d.material) { window.__DECALPROBE.after = read(); window.__DECALPROBE.draws++; }
      if (oa) oa.call(this, r, s, c, g, m);
    };
  }
  return Object.keys(window.__DECALPROBE);
};

/**
 * Project every decal instance's outer ring through the live camera, exactly as the vertex
 * shader displaces it. Returns one closed screen polygon per instance.
 */
const PROJECT = (SEG) => {
  const G = window.__GAME, THREE = G.THREE, e = G.engine;
  const cam = e.camera;
  cam.updateMatrixWorld(true);
  const cw = e.canvas.width, chh = e.canvas.height;
  const v = new THREE.Vector4();
  const out = [];
  for (const key of ['props', 'kaykit']) {
    const d = e.get(key)?.decals;
    if (!d?.mesh || !d.geometry) continue;
    const g = d.geometry, u = d.material.uniforms;
    const n = g.instanceCount;
    const C = g.attributes.iCentre.array, R = g.attributes.iRadius.array, Hh = g.attributes.iHeight.array;
    const kx = u.uKey.value.x, kz = u.uKey.value.y;
    const tx = -kz, tz = kx;
    const sl = u.uShadowLen.value, rf = u.uReach.value.x, rc = u.uReach.value.y;
    const push = u.uPush.value, gr = u.uRadius.value;
    for (let i = 0; i < n; i++) {
      const cx = C[i * 3], cy = C[i * 3 + 1], cz = C[i * 3 + 2];
      const r = R[i] * gr;
      const reach = Math.min(rc, rf * Hh[i] * sl) * gr;
      const pts = []; let ok = true;
      let sumX = 0, sumY = 0;
      for (let s = 0; s < SEG; s++) {
        const th = (s / SEG) * Math.PI * 2;
        const dx = Math.cos(th), dy = Math.sin(th);
        const along = dx * (r + reach) + reach * push;
        const px = kx * along + tx * (dy * r);
        const pz = kz * along + tz * (dy * r);
        v.set(cx + px, cy, cz + pz, 1);
        v.applyMatrix4(cam.matrixWorldInverse).applyMatrix4(cam.projectionMatrix);
        if (v.w <= 1e-6) { ok = false; break; }
        const sx = (v.x / v.w * 0.5 + 0.5) * cw;
        const sy = (-v.y / v.w * 0.5 + 0.5) * chh;
        pts.push(sx, sy); sumX += sx; sumY += sy;
      }
      if (!ok) continue;
      out.push({ key, i, pts, cx: sumX / SEG, cy: sumY / SEG,
                 world: [cx, cy, cz], rWorld: r, reach });
    }
  }
  return { canvas: [cw, chh], polys: out };
};

/** Where does the staged player's ground point land on screen? (PREREG §2.1, in-page check.) */
const PLAYER_PX = () => {
  const G = window.__GAME, THREE = G.THREE, e = G.engine;
  const ch = e.get('character');
  if (!ch?.root) return null;
  const p = ch.root.position.clone();
  const v = new THREE.Vector4(p.x, p.y, p.z, 1);
  e.camera.updateMatrixWorld(true);
  v.applyMatrix4(e.camera.matrixWorldInverse).applyMatrix4(e.camera.projectionMatrix);
  if (v.w <= 1e-6) return null;
  return { world: [p.x, p.y, p.z],
           px: (v.x / v.w * 0.5 + 0.5) * e.canvas.width,
           py: (-v.y / v.w * 0.5 + 0.5) * e.canvas.height };
};

/**
 * CAL-1 — a synthetic multiply whose sign is known by construction.
 * A flat grey ground plane, the REAL ContactDecals material over the right half, rendered to a
 * 64x64 target with an orthographic camera looking straight down. A correct multiply must darken
 * the right half. Reported for premultipliedAlpha true AND false, with the GL function each got.
 */
const SYNTH = async () => {
  const G = window.__GAME, THREE = G.THREE, e = G.engine;
  const mod = await import('/src/world/Decals.js');
  const gl = e.renderer.getContext();
  const names = {};
  for (const k of ['ZERO','ONE','SRC_COLOR','ONE_MINUS_SRC_COLOR','SRC_ALPHA','ONE_MINUS_SRC_ALPHA',
                   'DST_ALPHA','ONE_MINUS_DST_ALPHA','DST_COLOR','ONE_MINUS_DST_COLOR','SRC_ALPHA_SATURATE',
                   'CONSTANT_COLOR','ONE_MINUS_CONSTANT_COLOR','CONSTANT_ALPHA','ONE_MINUS_CONSTANT_ALPHA']) names[gl[k]] = k;

  const N = 64;
  const rt = new THREE.WebGLRenderTarget(N, N, { depthBuffer: true, stencilBuffer: false });
  rt.texture.colorSpace = THREE.NoColorSpace;
  const scene = new THREE.Scene();

  // ground: flat grey, no tone mapping, no lighting — a known destination colour
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(12, 12),
    new THREE.MeshBasicMaterial({ color: 0x808080, toneMapped: false })
  );
  ground.rotation.x = -Math.PI / 2;
  scene.add(ground);

  // the real decal, sized and placed to cover the RIGHT half only
  const d = new mod.ContactDecals(e, { name: 'cal1' });
  d.add(1.5, 0, 0, 1.0, 0);            // height 0 -> reach 0 -> a circle, radius 1.42 m
  d.build(scene);
  d.refresh();

  const cam = new THREE.OrthographicCamera(-3, 3, 3, -3, 0.1, 20);
  cam.position.set(0, 5, 0);
  cam.lookAt(0, 0, 0);
  cam.updateMatrixWorld(true);

  let seen = null;
  const oa = d.mesh.onAfterRender;
  d.mesh.onAfterRender = function (r, s, c, g, m) {
    if (m === d.material) seen = {
      srcRGB: names[gl.getParameter(gl.BLEND_SRC_RGB)], dstRGB: names[gl.getParameter(gl.BLEND_DST_RGB)],
      srcA: names[gl.getParameter(gl.BLEND_SRC_ALPHA)], dstA: names[gl.getParameter(gl.BLEND_DST_ALPHA)],
    };
    if (oa) oa.call(this, r, s, c, g, m);
  };

  const buf = new Uint8Array(N * N * 4);
  const run = (premul) => {
    d.material.premultipliedAlpha = premul;
    d.material.needsUpdate = true;
    seen = null;
    const prev = e.renderer.getRenderTarget();
    e.renderer.setRenderTarget(rt);
    e.renderer.setClearColor(0x000000, 1);
    e.renderer.clear(true, true, true);
    e.renderer.render(scene, cam);
    e.renderer.readRenderTargetPixels(rt, 0, 0, N, N, buf);
    e.renderer.setRenderTarget(prev);
    /* Left box: world x -2.81..-1.69, clear of the decal (which starts at x = 0.08).
       Right box: world x 0.94..2.06 / z -0.56..0.56, i.e. radius <= 0.79 about the decal's
       centre against a core ring at 0.913 — entirely inside the full-strength lobe. */
    const lum = (x0, x1, y0, y1) => {
      let s = 0, k = 0;
      for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
        const p = (y * N + x) * 4;
        s += 0.2126 * buf[p] + 0.7152 * buf[p + 1] + 0.0722 * buf[p + 2]; k++;
      }
      return s / k;
    };
    return { left: lum(2, 14, 26, 38), right: lum(42, 54, 26, 38), blend: seen };
  };

  const on = run(true);
  const off = run(false);
  d.dispose();
  rt.dispose();
  ground.geometry.dispose(); ground.material.dispose();
  return { premulTrue: on, premulFalse: off };
};

/* ----------------------------------------------------------------------------------------- */
/* node-side raster + statistics                                                               */
/* ----------------------------------------------------------------------------------------- */

function decode(dataUrl) {
  const b = Buffer.from(dataUrl.split(',')[1], 'base64');
  const png = PNG.sync.read(b);
  const L = new Float32Array(png.width * png.height);
  for (let i = 0, p = 0; i < L.length; i++, p += 4) {
    L[i] = 0.2126 * png.data[p] + 0.7152 * png.data[p + 1] + 0.0722 * png.data[p + 2];
  }
  return { w: png.width, h: png.height, L, raw: b };
}

/** Even-odd scanline fill of one closed polygon into `mask` with `bit`. */
function fillPoly(mask, w, h, pts, bit) {
  const n = pts.length / 2;
  let y0 = Infinity, y1 = -Infinity;
  for (let i = 0; i < n; i++) { const y = pts[i * 2 + 1]; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  y0 = Math.max(0, Math.floor(y0)); y1 = Math.min(h - 1, Math.ceil(y1));
  const xs = [];
  for (let y = y0; y <= y1; y++) {
    const cy = y + 0.5;
    xs.length = 0;
    for (let i = 0; i < n; i++) {
      const ax = pts[i * 2], ay = pts[i * 2 + 1];
      const j = (i + 1) % n, bx = pts[j * 2], by = pts[j * 2 + 1];
      if ((ay <= cy && by > cy) || (by <= cy && ay > cy)) xs.push(ax + (cy - ay) / (by - ay) * (bx - ax));
    }
    xs.sort((a, b) => a - b);
    for (let k = 0; k + 1 < xs.length; k += 2) {
      const s = Math.max(0, Math.ceil(xs[k] - 0.5)), t = Math.min(w - 1, Math.floor(xs[k + 1] - 0.5));
      for (let x = s; x <= t; x++) mask[y * w + x] |= bit;
    }
  }
}

const scaled = (p, s) => {
  const out = new Array(p.pts.length);
  for (let i = 0; i < p.pts.length; i += 2) {
    out[i] = p.cx + (p.pts[i] - p.cx) * s;
    out[i + 1] = p.cy + (p.pts[i + 1] - p.cy) * s;
  }
  return out;
};

const FOOT = 1, INNER = 2, WIDE = 4, NEAR = 8;

function buildMasks(polys, w, h) {
  const m = new Uint8Array(w * h);
  for (const p of polys) {
    fillPoly(m, w, h, p.pts, FOOT);
    fillPoly(m, w, h, scaled(p, 0.85), INNER);
    fillPoly(m, w, h, scaled(p, 3.0), WIDE);
    fillPoly(m, w, h, scaled(p, 1.5), NEAR);
  }
  return m;
}

/** Pixels more than `r` px outside every FOOT — a chebyshev dilation of the footprint. */
function farMask(m, w, h, r) {
  const dil = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    if (!(m[y * w + x] & FOOT)) continue;
    for (let j = Math.max(0, y - r); j <= Math.min(h - 1, y + r); j++)
      for (let i = Math.max(0, x - r); i <= Math.min(w - 1, x + r); i++) dil[j * w + i] = 1;
  }
  return dil;
}

const median = (a) => { if (!a.length) return NaN; a.sort((x, y) => x - y); return a[a.length >> 1]; };
const pct = (a, t) => (a.length ? a[Math.min(a.length - 1, Math.round(t * (a.length - 1)))] : NaN);
const mean = (a) => (a.length ? a.reduce((s, v) => s + v, 0) / a.length : NaN);

function stats(base, arm, m, w, h, sel) {
  const d = [];
  for (let i = 0; i < base.L.length; i++) if (sel(m[i])) d.push(arm.L[i] - base.L[i]);
  d.sort((x, y) => x - y);
  return { n: d.length, med: median(d), p10: pct(d, 0.1), p90: pct(d, 0.9), mean: mean(d) };
}

function countChanged(a, b, thr, pick) {
  let n = 0;
  for (let i = 0; i < a.L.length; i++) if (pick(i) && Math.abs(a.L[i] - b.L[i]) > thr) n++;
  return n;
}

/* ----------------------------------------------------------------------------------------- */

const report = { shot: SHOT, w: W, h: H, quality: Q, at: new Date().toISOString() };

await withGame({
  width: W, height: H, quality: Q, timeout: 420000, verbose: false,
  /* §186/§194: `src/**` may only move while this process holds the capture lock, and this is the
     one moment that is true and the bundler has not yet read the tree. Idempotent. */
  onLocked: () => { report.fix = applyFix(); console.log('fix:', JSON.stringify(report.fix)); },
}, async ({ page, info }) => {
  report.renderer = info.renderer;
  report.bootConsoleErrors = info.consoleErrors.slice();
  report.bootWarningPresent = info.consoleErrors.some((t) => WARN_RE.test(t));

  // per-arm console capture
  const live = [];
  page.on('console', (m) => { if (m.type() === 'error') live.push(m.text()); });
  page.on('pageerror', (e) => live.push(`pageerror: ${e.message}`));
  const since = () => { const n = live.length; return () => live.slice(n); };

  await page.evaluate(INSTALL_PROBE);

  /* CLEAN — the material exactly as the tree ships it. Renders real frames (renderFrame draws
     the decals), so a warning would be emitted here if the shipped config still provoked one. */
  let w0 = since();
  await page.evaluate(() => window.__GAME.step(4, 1 / 60));
  const cleanProbe = await page.evaluate(() => window.__DECALPROBE);
  report.clean = { probe: cleanProbe, consoleErrors: w0(), warnSeen: w0().some((t) => WARN_RE.test(t)) };
  console.log('CLEAN  draws', cleanProbe.draws, 'blend', JSON.stringify(cleanProbe.after));

  const arms = {};
  const runArm = async (name, setup) => {
    const t0 = Date.now();
    await page.evaluate(setup.fn, setup.arg);
    const w = since();
    await page.evaluate(() => { window.__DECALPROBE.draws = 0; window.__DECALPROBE.after = null; window.__DECALPROBE.before = null; });
    const r = await page.evaluate(async (n) => {
      const s = await window.__GAME.setShot(n);
      return { dataUrl: window.__GAME.capture('image/png'), warnings: s.warnings.length, stats: s.stats };
    }, SHOT);
    const probe = await page.evaluate(() => window.__DECALPROBE);
    const img = decode(r.dataUrl);
    writeFileSync(path.join(OUT, `${name}.png`), img.raw);
    const errs = w();
    arms[name] = { img, probe, consoleErrors: errs, warnSeen: errs.some((t) => WARN_RE.test(t)) };
    report[name] = { probe, consoleErrors: errs, warnSeen: arms[name].warnSeen, warnings: r.warnings };
    console.log(`${name.padEnd(6)} ${img.w}x${img.h}  decal draws ${probe.draws}  `
      + `blend ${probe.after ? probe.after.srcRGB + '/' + probe.after.dstRGB + ' | ' + probe.after.srcA + '/' + probe.after.dstA : 'n/a'}  `
      + `${((Date.now() - t0) / 1000).toFixed(0)}s` + (errs.length ? `  [${errs.length} console errors]` : ''));
  };

  await runArm('A1', { fn: SET_PREMUL, arg: false });
  await runArm('A2', { fn: SET_PREMUL, arg: true });
  await runArm('A3', { fn: SET_PREMUL, arg: true });

  // masks off the live camera, in the arm configuration the mask is meant to describe
  const proj = await page.evaluate(PROJECT, 96);
  const player = await page.evaluate(PLAYER_PX);
  report.projection = { canvas: proj.canvas, count: proj.polys.length, player };
  report.polys = proj.polys.map((p) => ({ key: p.key, i: p.i, cx: +p.cx.toFixed(1), cy: +p.cy.toFixed(1),
    world: p.world.map((v) => +v.toFixed(2)), rWorld: +p.rWorld.toFixed(3), reach: +p.reach.toFixed(3) }));

  await runArm('A4', { fn: () => { window.__GAME.engine.debug.decalScale = 0; return 'off'; }, arg: null });
  await page.evaluate(() => { window.__GAME.engine.debug.decalScale = 1; });

  report.synth = await page.evaluate(SYNTH);
  console.log('CAL-1 synth', JSON.stringify(report.synth));

  /* ---------------- analysis ---------------- */
  const { w, h } = arms.A1.img;
  const m = buildMasks(proj.polys, w, h);
  const far = farMask(m, w, h, 8);

  const isFoot = (v) => (v & FOOT) !== 0;
  const isRim = (v) => (v & FOOT) !== 0 && (v & INNER) === 0;
  const isOut = (v) => (v & WIDE) !== 0 && (v & NEAR) === 0 && (v & FOOT) === 0;
  let nFoot = 0, nRim = 0, nOut = 0, nFar = 0;
  for (let i = 0; i < m.length; i++) { if (isFoot(m[i])) nFoot++; if (isRim(m[i])) nRim++; if (isOut(m[i])) nOut++; if (!far[i]) nFar++; }
  report.masks = { foot: nFoot, rim: nRim, out: nOut, far: nFar };

  const A1 = arms.A1.img, A2 = arms.A2.img, A3 = arms.A3.img, A4 = arms.A4.img;
  report.primary = {
    MED_A1: stats(A4, A1, m, w, h, isFoot),
    MED_A2: stats(A4, A2, m, w, h, isFoot),
    MED_A3: stats(A4, A3, m, w, h, isFoot),
    MED_NULL: stats(A3, A2, m, w, h, isFoot),
    RIM_A1: stats(A4, A1, m, w, h, isRim),
    RIM_A2: stats(A4, A2, m, w, h, isRim),
  };
  report.cal2 = {
    N_A2_vs_A4: countChanged(A2, A4, 2, (i) => isFoot(m[i])),
    N_A1_vs_A4: countChanged(A1, A4, 2, (i) => isFoot(m[i])),
  };
  report.drift = {
    PX_NULL: countChanged(A2, A3, 2, () => true),
    PX_FAR_NULL: countChanged(A2, A3, 2, (i) => !far[i]),
    PX_FAR_FIXvsBROKEN: countChanged(A2, A1, 2, (i) => !far[i]),
    PX_WHOLE_FIXvsBROKEN: countChanged(A2, A1, 2, () => true),
  };

  // critic-form restatement: floor under the decal against floor just outside it
  const touched = new Uint8Array(w * h);
  for (let i = 0; i < touched.length; i++) touched[i] = isFoot(m[i]) && Math.abs(A2.L[i] - A4.L[i]) > 2 ? 1 : 0;
  const halo = (im) => {
    let si = 0, ni = 0, so = 0, no = 0;
    for (let i = 0; i < im.L.length; i++) {
      if (touched[i]) { si += im.L[i]; ni++; }
      else if (isOut(m[i])) { so += im.L[i]; no++; }
    }
    return { inside: si / ni, outside: so / no, halo: si / ni - so / no, nIn: ni, nOut: no };
  };
  report.halo = { A1: halo(A1), A2: halo(A2), A4: halo(A4) };

  writeFileSync(path.join(OUT, 'report.json'), JSON.stringify(report, null, 1));
  return report;
});

/* ----------------------------------------------------------------------------------------- */

const f = (v) => (Number.isFinite(v) ? v.toFixed(2).padStart(8) : '     n/a');
const p = report.primary;
console.log(`\n================ decalsign — ${SHOT} ${W}x${H} ${Q} ================`);
console.log(`masks: FOOT ${report.masks.foot} px   RIM ${report.masks.rim} px   OUT ${report.masks.out} px   decals projected ${report.projection.count}`);
console.log(`player ground point at ${report.projection.player ? report.projection.player.px.toFixed(0) + ',' + report.projection.player.py.toFixed(0) : 'n/a'}`);
console.log('');
console.log('CAL-1 synthetic multiply over a known grey (MUST darken by >= 20 L):');
for (const k of ['premulTrue', 'premulFalse']) {
  const s = report.synth[k];
  console.log(`  ${k.padEnd(12)} left ${f(s.left)}  right ${f(s.right)}  delta ${f(s.right - s.left)}   blend ${s.blend ? s.blend.srcRGB + '/' + s.blend.dstRGB : 'n/a'}`);
}
console.log('');
console.log('PRIMARY — median (arm - A4 OFF) over FOOT:');
console.log(`  A1 BROKEN  ${f(p.MED_A1.med)}   p10 ${f(p.MED_A1.p10)}  p90 ${f(p.MED_A1.p90)}   n ${p.MED_A1.n}`);
console.log(`  A2 FIXED   ${f(p.MED_A2.med)}   p10 ${f(p.MED_A2.p10)}  p90 ${f(p.MED_A2.p90)}   n ${p.MED_A2.n}`);
console.log(`  A3 FIXED'  ${f(p.MED_A3.med)}`);
console.log(`  NULL A2-A3 ${f(p.MED_NULL.med)}   p10 ${f(p.MED_NULL.p10)}  p90 ${f(p.MED_NULL.p90)}`);
console.log(`  RIM A1     ${f(p.RIM_A1.med)}      RIM A2 ${f(p.RIM_A2.med)}`);
console.log('');
console.log(`CAL-2 pixels moved inside FOOT by turning decals off: A2 ${report.cal2.N_A2_vs_A4}   A1 ${report.cal2.N_A1_vs_A4}   (need >= 500)`);
console.log(`DRIFT PX_NULL ${report.drift.PX_NULL}   PX_FAR_NULL ${report.drift.PX_FAR_NULL}   PX_FAR(A2-A1) ${report.drift.PX_FAR_FIXvsBROKEN}`);
console.log('');
console.log('HALO (critic form) — mean L inside the decal minus mean L just outside it:');
for (const k of ['A1', 'A2', 'A4']) {
  const s = report.halo[k];
  console.log(`  ${k}  inside ${f(s.inside)}  outside ${f(s.outside)}  halo ${f(s.halo)}`);
}
console.log('');
console.log(`CR-3 boot warning present at clean boot: ${report.bootWarningPresent}   (clean-step window: ${report.clean.warnSeen})`);
console.log(`CAL-4 warning seen while A1 rendered:    ${report.A1?.warnSeen}`);
console.log(`      warning seen while A2 rendered:    ${report.A2?.warnSeen}`);
console.log(`\nwritten to ${OUT}`);

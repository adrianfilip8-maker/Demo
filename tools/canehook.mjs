#!/usr/bin/env node
/* canehook — §719. Does the hook's gold reach the hook's own pixels, and only those?
 *
 * ── What this measures, and why each half exists ────────────────────────────────────────────
 *
 * §719 tints the crook of the owner-supplied cane by authoring `COLOR_0` on the adopted
 * geometry — gold across the hook, (1,1,1) across everything else so the asset's own albedo
 * survives there. Three separate things have to be true for that to be the change it claims to
 * be, and each of them has already been got wrong once in this project by somebody who checked
 * only one:
 *
 *   A  THE CLASSIFIER TAGGED THE HOOK.  Not everything, not nothing, not a chip off the side.
 *      §418.3 wants the failing input in the arm, not in a comment, so the counts are read off
 *      the LIVE geometry and checked against the geometry's own extents: the tagged set must be
 *      a strict minority-to-majority slice that owns the prop's highest vertex and the vertex
 *      farthest off the shaft axis, and must NOT own the butt.
 *
 *   B  THE TINT IS THE COLOUR IT SAYS IT IS.  `CaneAsset.ASSET_HOOK_ALBEDO` is a measured
 *      property of the shipped `.glb`, and a literal that drifts from its asset is §700.3's
 *      failure mode. So it is RE-DERIVED here, in-page, off the decoded texture that the shipped
 *      material is actually holding — every hook triangle's UVs rasterised into the baseColour
 *      image — rather than trusted.
 *
 *   C  THE PIXELS MOVED, ON THE HOOK, AND NOWHERE ELSE.  A colour claim in this repo is worth
 *      nothing without the frame that could have falsified it. The hook's screen footprint is
 *      obtained by DIFFERENCING (tag the hook's own vertices magenta, diff against base), which
 *      is `canegold.mjs`'s I3 trick one level down: it marks exactly the pixels those vertices
 *      paint, and it is the positive control that MUST fire (§255 — a null arm proves
 *      repeatability, not sensitivity). The before/after delta is then read over that mask by
 *      pushing the hook's `COLOR_0` back to white, which is bit-for-bit the pre-§719 albedo:
 *      the material multiplies by it, and `mix(x, y, 0) == x`.
 *
 * ── What it deliberately does NOT do ────────────────────────────────────────────────────────
 *
 * It does not touch `uMetal`, `uGloss`, `uSpec` or `roughness`. §266 measured those on this
 * exact material and refused them, and this tool must not be the thing that quietly re-opens
 * that: it asserts they are UNCHANGED across every arm instead (I5 below), so a run that drifts
 * into the metal question voids itself rather than reporting a colour result contaminated by it.
 *
 * ── Why one boot ────────────────────────────────────────────────────────────────────────────
 *
 * Every arm is a live poke of the geometry's own `color` attribute, so no recompile can reorder
 * draws between arms, and `setShot(..., { dt: 0 })` freezes the pose (§251). The capture lock is
 * a fair FIFO and a frame is 14 s of software rendering — this run takes four.
 *
 *   node tools/canehook.mjs                 # sly-closeup
 *   node tools/canehook.mjs hero            # any canonical shot
 */
import { withGame } from './harness.mjs';
import { shipVerdict, verdictLine } from './gate.mjs';
import { readPNG } from './png.mjs';

const argv = process.argv.slice(2);

/* ---------------------------------------------------------------------------------------------
 * `--frames BEFORE.png AFTER.png` — the SECOND instrument, and it exists because the first one
 * cannot falsify itself.
 *
 * The in-page run below measures the change by poking `COLOR_0` live, which means it shares its
 * subject's entire mechanism: if the vertex-colour path were doing something other than what it
 * is believed to do, that arm would report the same numbers and be equally wrong (§439/§440).
 * This mode shares none of it. It reads two PNGs captured from two different COMMITS through
 * `tools/shot.mjs`, takes the pixels that differ as the population, and reports the colour of
 * that population in both. Nothing here boots a game, pokes a uniform, or knows what a cane is.
 *
 *   node tools/canehook.mjs --frames shots/719-before/sly-closeup.png shots/719-after/sly-closeup.png
 * ------------------------------------------------------------------------------------------ */
const fi = argv.indexOf('--frames');
if (fi >= 0) {
  const [A, B] = argv.slice(fi + 1, fi + 3);
  const a = readPNG(A), b = readPNG(B);
  if (a.w !== b.w || a.h !== b.h) throw new Error(`size mismatch: ${a.w}x${a.h} vs ${b.w}x${b.h}`);
  const ch = a.ch;
  const idx = [];
  let x0 = 1e9, y0 = 1e9, x1 = -1, y1 = -1;
  for (let y = 0; y < a.h; y++) {
    for (let x = 0; x < a.w; x++) {
      const i = (y * a.w + x) * ch;
      if (a.data[i] === b.data[i] && a.data[i + 1] === b.data[i + 1] && a.data[i + 2] === b.data[i + 2]) continue;
      idx.push(i);
      if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
    }
  }
  const stat = (d) => {
    let sr = 0, sg = 0, sb = 0, sL = 0, sS = 0; const L = [];
    for (const i of idx) {
      const r = d[i], g = d[i + 1], bl = d[i + 2];
      const mx = Math.max(r, g, bl), mn = Math.min(r, g, bl);
      sr += r; sg += g; sb += bl; sS += mx > 0 ? (mx - mn) / mx : 0;
      const l = 0.2126 * r + 0.7152 * g + 0.0722 * bl; sL += l; L.push(l);
    }
    L.sort((p, q) => p - q);
    const n = idx.length || 1, q = (p) => (L.length ? L[Math.round(p * (L.length - 1))] : null);
    return { mean: sL / n, p50: q(0.5), p90: q(0.9), p99: q(0.99), sat: sS / n,
      r: sr / n, g: sg / n, b: sb / n, rb: (sr - sb) / n };
  };
  const SA = stat(a.data), SB = stat(b.data);
  const f = (x, d = 1) => (x == null ? '   —  ' : x.toFixed(d).padStart(7));
  console.log(`\n### §719 frame pair — ${A}  ->  ${B}   (${a.w}x${a.h})`);
  console.log(`  pixels changed ${idx.length} of ${a.w * a.h} (${(100 * idx.length / (a.w * a.h)).toFixed(3)}%)`
    + `   bbox ${x1 < 0 ? '(none)' : `x ${x0}..${x1}  y ${y0}..${y1}  (${x1 - x0 + 1}x${y1 - y0 + 1})`}`);
  console.log(`  ${'frame'.padEnd(10)}${'meanL'.padStart(8)}${'p50'.padStart(8)}${'p90'.padStart(8)}${'p99'.padStart(8)}`
    + `${'sat'.padStart(8)}${'R'.padStart(7)}${'G'.padStart(7)}${'B'.padStart(7)}${'R-B'.padStart(8)}`);
  const row = (nm, s) => console.log(`  ${nm.padEnd(10)}${f(s.mean)}${f(s.p50)}${f(s.p90)}${f(s.p99)}`
    + `${f(s.sat, 3)}${f(s.r, 0)}${f(s.g, 0)}${f(s.b, 0)}${f(s.rb, 1)}`);
  row('before', SA); row('after', SB);
  console.log(`  ${'Δ'.padEnd(10)}${f(SB.mean - SA.mean)}${f(SB.p50 - SA.p50)}${f(SB.p90 - SA.p90)}`
    + `${f(SB.p99 - SA.p99)}${f(SB.sat - SA.sat, 3)}${f(SB.r - SA.r, 0)}${f(SB.g - SA.g, 0)}`
    + `${f(SB.b - SA.b, 0)}${f(SB.rb - SA.rb, 1)}`);
  process.exit(0);
}

const SHOT = argv.find((a) => !a.startsWith('--')) || 'sly-closeup';

const out = await withGame({ width: 1280, height: 720, quality: 'high' }, async ({ page }) => {
  await page.evaluate(() => {
    const W = window;
    W.__CAP = {};
    W.__cane = () => { let f = null; W.__ENGINE.scene.traverse((o) => { if (o.name === 'cane') f = o; }); return f; };

    /* ---- A: the classification, read off the live geometry ------------------------------
       Nothing here trusts `Cane.js`'s own bookkeeping: the tagged set is recovered from the
       attribute the shader will actually sample, and its extents are recomputed from the
       positions the shader will actually transform. */
    W.__classify = () => {
      const m = W.__cane();
      if (!m) return { err: 'no mesh named "cane" in the scene' };
      const g = m.geometry;
      const pos = g.attributes.position, col = g.attributes.color;
      if (!col) return { err: 'the cane geometry carries no COLOR_0 attribute' };
      const n = pos.count;
      const box = (sel) => {
        const b = { n: 0, ylo: Infinity, yhi: -Infinity, zlo: Infinity, zhi: -Infinity, rlo: Infinity, rhi: -Infinity };
        for (let i = 0; i < n; i++) {
          if (!sel(i)) continue;
          const y = pos.getY(i), z = pos.getZ(i), r = Math.hypot(pos.getX(i), z);
          b.n++; b.ylo = Math.min(b.ylo, y); b.yhi = Math.max(b.yhi, y);
          b.zlo = Math.min(b.zlo, z); b.zhi = Math.max(b.zhi, z);
          b.rlo = Math.min(b.rlo, r); b.rhi = Math.max(b.rhi, r);
        }
        return b;
      };
      /* "tinted" is any vertex whose colour is not white — the ramp makes this a soft set, so
         the partial band is reported separately rather than folded into either side. */
      const white = (i) => col.getX(i) > 0.999 && col.getY(i) > 0.999 && col.getZ(i) > 0.999;
      const full = (i) => col.getX(i) < 0.999 && Math.abs(col.getX(i) - W.__FULL[0]) < 1e-4
        && Math.abs(col.getY(i) - W.__FULL[1]) < 1e-4 && Math.abs(col.getZ(i) - W.__FULL[2]) < 1e-4;
      /* the fully-saturated tint value is whatever the darkest tinted vertex carries */
      let dark = [1, 1, 1];
      for (let i = 0; i < n; i++) if (col.getX(i) < dark[0]) dark = [col.getX(i), col.getY(i), col.getZ(i)];
      W.__FULL = dark;
      return {
        verts: n,
        indices: g.index ? g.index.count : 0,
        groups: g.groups.length,
        materials: Array.isArray(m.material) ? m.material.length : 1,
        tintFull: dark,
        all: box(() => true),
        tinted: box((i) => !white(i)),
        full: box(full),
        ramp: box((i) => !white(i) && !full(i)),
        white: box(white),
        tag: m.parent?.userData?.hookTag || m.parent?.parent?.userData?.hookTag || null,
      };
    };

    /* ---- B: re-derive the asset's authored hook albedo, in-page, off the bound map ------- */
    W.__albedo = () => {
      const m = W.__cane();
      const mat = Array.isArray(m.material) ? m.material[0] : m.material;
      const img = mat?.map?.image;
      if (!img) return { err: 'the cane material holds no baseColour map' };
      const c = document.createElement('canvas');
      c.width = img.width; c.height = img.height;
      const g2 = c.getContext('2d', { willReadFrequently: true });
      g2.drawImage(img, 0, 0);
      const px = g2.getImageData(0, 0, img.width, img.height).data;
      const g = m.geometry, uv = g.attributes.uv, col = g.attributes.color, ix = g.index;
      /* Per TRIANGLE, so the answer is the colour the surface actually shows, and split by
         whether §719 tinted that triangle — the two populations must be different shells or the
         classifier is not selecting on anything the author distinguished. */
      const bins = { hook: new Map(), rest: new Map() };
      const at = (u, v) => {
        /* glTF UV origin is top-left and the texture ships flipY false, so v indexes rows
           directly. Sampling the CENTROID, not a corner: a corner sits on a shell seam. */
        const x = Math.min(img.width - 1, Math.max(0, Math.floor(u * img.width)));
        const y = Math.min(img.height - 1, Math.max(0, Math.floor(v * img.height)));
        const o = (y * img.width + x) * 4;
        return [px[o], px[o + 1], px[o + 2]];
      };
      for (let t = 0; t + 2 < ix.count; t += 3) {
        const a = ix.getX(t), b = ix.getX(t + 1), c3 = ix.getX(t + 2);
        const u = (uv.getX(a) + uv.getX(b) + uv.getX(c3)) / 3;
        const v = (uv.getY(a) + uv.getY(b) + uv.getY(c3)) / 3;
        const [r, gg, bb] = at(u, v);
        const tinted = col.getX(a) < 0.999 || col.getX(b) < 0.999 || col.getX(c3) < 0.999;
        const key = `#${[r, gg, bb].map((q) => q.toString(16).padStart(2, '0')).join('')}`;
        const m2 = tinted ? bins.hook : bins.rest;
        m2.set(key, (m2.get(key) || 0) + 1);
      }
      const top = (m2) => [...m2.entries()].sort((a, b) => b[1] - a[1]).slice(0, 4);
      return { image: [img.width, img.height], hook: top(bins.hook), rest: top(bins.rest),
        hookTris: [...bins.hook.values()].reduce((s, v) => s + v, 0),
        restTris: [...bins.rest.values()].reduce((s, v) => s + v, 0) };
    };

    /* ---- the COLOR_0 arms ---------------------------------------------------------------- */
    W.__saveColor = () => { const g = W.__cane().geometry; W.__COL0 = Float32Array.from(g.attributes.color.array); };
    W.__setHook = (rgb) => {                       // rgb null => restore the shipped attribute
      const g = W.__cane().geometry, col = g.attributes.color, src = W.__COL0;
      for (let i = 0; i < col.count; i++) {
        const wasTinted = src[i * 3] < 0.999 || src[i * 3 + 1] < 0.999 || src[i * 3 + 2] < 0.999;
        if (rgb === null) { col.setXYZ(i, src[i * 3], src[i * 3 + 1], src[i * 3 + 2]); continue; }
        if (!wasTinted) continue;
        col.setXYZ(i, rgb[0], rgb[1], rgb[2]);
      }
      col.needsUpdate = true;
      return true;
    };
    /* I5: the metal/gloss/spec state §266 refused, read (never written) so a drift voids the run */
    W.__matState = () => {
      const m = W.__cane();
      const mat = Array.isArray(m.material) ? m.material[0] : m.material;
      const u = mat.userData?.slyUniforms;
      return { name: mat.name, spec: u?.uSpec?.value, gloss: u?.uGloss?.value, metal: u?.uMetal?.value,
        rough: mat.roughness, vertexColors: !!mat.vertexColors, colorHex: mat.color.getHex(),
        hasMap: !!mat.map };
    };
    /* the ink shell: it must not read COLOR_0 at all, or the line moves with the albedo */
    W.__shell = () => {
      const m = W.__cane();
      const sh = m.userData?.slyShell || m.children.find((c) => c.userData?.slyOutline || c.userData?.isOutlineShell);
      if (!sh) return { err: 'no ink shell on the cane mesh' };
      return { name: sh.material?.name, vertexColors: !!sh.material?.vertexColors,
        sharesGeometry: sh.geometry === m.geometry, isShader: !!sh.material?.isShaderMaterial };
    };

    W.__snap = async (key, shot) => {
      const r = await W.__GAME.setShot(shot, { dt: 0 });
      const url = W.__GAME.capture('image/png', 1.0, 0);
      const img = new Image(); img.src = url; await img.decode();
      const c = document.createElement('canvas'); c.width = img.width; c.height = img.height;
      const g = c.getContext('2d', { willReadFrequently: true });
      g.drawImage(img, 0, 0);
      W.__CAP[key] = { w: img.width, h: img.height, d: g.getImageData(0, 0, img.width, img.height).data };
      return { w: img.width, h: img.height, warnings: r.warnings.length };
    };
    W.__L = (d, i) => 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2];
    W.__diff = (a, b, wantIdx) => {
      const A = W.__CAP[a], B = W.__CAP[b];
      let n = 0; const idx = [];
      for (let i = 0; i < A.d.length; i += 4) {
        if (A.d[i] !== B.d[i] || A.d[i + 1] !== B.d[i + 1] || A.d[i + 2] !== B.d[i + 2]) { n++; if (wantIdx) idx.push(i); }
      }
      return wantIdx ? { n, idx } : { n };
    };
    /* Luminance AND chroma over a mask. The claim §719 makes is about HUE, so a tool that can
       only see luminance cannot falsify it — it would report the darkening and miss the point
       (§440: an instrument that shares its subject's blind spot). `sat` is sRGB
       (max-min)/max and `hue` is the R-B split, both cheap and both directly about "is it gold". */
    W.__stats = (key, idx) => {
      const A = W.__CAP[key];
      const L = new Float64Array(idx.length), S = new Float64Array(idx.length);
      let sr = 0, sg = 0, sb = 0, sL = 0, sS = 0;
      for (let k = 0; k < idx.length; k++) {
        const i = idx[k], r = A.d[i], g = A.d[i + 1], b = A.d[i + 2];
        const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
        L[k] = W.__L(A.d, i); S[k] = mx > 0 ? (mx - mn) / mx : 0;
        sr += r; sg += g; sb += b; sL += L[k]; sS += S[k];
      }
      L.sort(); S.sort();
      const q = (v, p) => (v.length ? v[Math.min(v.length - 1, Math.max(0, Math.round(p * (v.length - 1))))] : null);
      const n = idx.length || 1;
      return { n: idx.length, mean: sL / n, p50: q(L, 0.5), p90: q(L, 0.9), p99: q(L, 0.99),
        sat: sS / n, satP50: q(S, 0.5), r: sr / n, g: sg / n, b: sb / n, rb: (sr - sb) / n };
    };
    W.__outside = (a, b, idx) => {
      const A = W.__CAP[a], B = W.__CAP[b];
      const inMask = new Uint8Array(A.d.length / 4);
      for (const i of idx) inMask[i / 4] = 1;
      let n = 0;
      for (let i = 0; i < A.d.length; i += 4) {
        if (inMask[i / 4]) continue;
        if (A.d[i] !== B.d[i] || A.d[i + 1] !== B.d[i + 1] || A.d[i + 2] !== B.d[i + 2]) n++;
      }
      return n;
    };
  });

  const R = { shot: SHOT };
  R.classify = await page.evaluate(() => window.__classify());
  if (R.classify.err) throw new Error(`classification unreadable: ${R.classify.err}`);
  R.albedo = await page.evaluate(() => window.__albedo());
  R.mat0 = await page.evaluate(() => window.__matState());
  R.shell = await page.evaluate(() => window.__shell());
  await page.evaluate(() => window.__saveColor());

  /* --- I1 base / I2 null ---------------------------------------------------------------- */
  await page.evaluate(([s]) => window.__snap('base', s), [SHOT]);
  await page.evaluate(([s]) => window.__snap('base2', s), [SHOT]);
  R.I2 = (await page.evaluate(() => window.__diff('base', 'base2'))).n;

  /* --- I3 the hook's own footprint: tag its vertices, diff. MUST fire. ------------------- */
  await page.evaluate(([s]) => { window.__setHook([1, 0, 1]); return window.__snap('tag', s); }, [SHOT]);
  const mask = await page.evaluate(() => {
    const d = window.__diff('base', 'tag', true);
    window.__MASK = d.idx;
    return { n: d.n };
  });
  R.I3 = mask.n;

  /* --- C1 the pre-§719 albedo: the hook's COLOR_0 back to white ------------------------- */
  await page.evaluate(([s]) => { window.__setHook([1, 1, 1]); return window.__snap('flat', s); }, [SHOT]);
  R.flat = await page.evaluate(() => window.__stats('flat', window.__MASK));
  R.flatOutside = await page.evaluate(() => window.__outside('base', 'flat', window.__MASK));

  /* --- I4 restore: MUST re-equal base ---------------------------------------------------- */
  await page.evaluate(([s]) => { window.__setHook(null); return window.__snap('restore', s); }, [SHOT]);
  R.I4 = (await page.evaluate(() => window.__diff('base', 'restore'))).n;
  R.gold = await page.evaluate(() => window.__stats('base', window.__MASK));
  R.mat1 = await page.evaluate(() => window.__matState());

  return R;
});

/* ================================== report ==================================== */
const C = out.classify;
const f = (x, d = 1) => (x == null ? '   —  ' : x.toFixed(d).padStart(7));
console.log(`\n${'='.repeat(88)}\n### §719 canehook — ${out.shot}\n`);

console.log('A. CLASSIFICATION, read off the live geometry the shader samples');
console.log(`   cane mesh: ${C.verts} verts, ${C.indices} indices (${C.indices / 3} tris), `
  + `${C.groups} geometry group(s), ${C.materials} material(s)`);
console.log(`   whole prop   n ${String(C.all.n).padStart(4)}   y ${C.all.ylo.toFixed(3)}..${C.all.yhi.toFixed(3)}   `
  + `z ${C.all.zlo.toFixed(3)}..${C.all.zhi.toFixed(3)}   rAxis ${C.all.rlo.toFixed(3)}..${C.all.rhi.toFixed(3)}`);
for (const [k, b] of [['TINTED (any)', C.tinted], ['  at full tint', C.full], ['  in the ramp', C.ramp], ['untouched', C.white]]) {
  if (!b.n) { console.log(`   ${k.padEnd(13)} n    0`); continue; }
  console.log(`   ${k.padEnd(13)} n ${String(b.n).padStart(4)}   y ${b.ylo.toFixed(3)}..${b.yhi.toFixed(3)}   `
    + `z ${b.zlo.toFixed(3)}..${b.zhi.toFixed(3)}   rAxis ${b.rlo.toFixed(3)}..${b.rhi.toFixed(3)}`);
}
console.log(`   tint at full strength (LINEAR, as COLOR_0 stores it): `
  + `(${C.tintFull.map((v) => v.toFixed(4)).join(', ')})`);
if (C.tag) console.log(`   Cane.js's own record: ${JSON.stringify(C.tag)}`);

console.log('\nB. THE ASSET\'S AUTHORED ALBEDO, re-derived in-page off the decoded map');
if (out.albedo.err) console.log(`   ${out.albedo.err}`);
else {
  console.log(`   baseColour image ${out.albedo.image[0]}x${out.albedo.image[1]}`);
  console.log(`   tinted triangles  (${out.albedo.hookTris}): ${out.albedo.hook.map(([k, n]) => `${k} x${n}`).join('  ')}`);
  console.log(`   untinted triangles(${out.albedo.restTris}): ${out.albedo.rest.map(([k, n]) => `${k} x${n}`).join('  ')}`);
}

console.log('\nC. PIXELS');
console.log(`   |hook footprint| = ${out.I3} px    (I2 null ${out.I2} px, I4 restore ${out.I4} px, `
  + `pixels moved outside the mask ${out.flatOutside})`);
console.log(`   ${'arm'.padEnd(22)}${'meanL'.padStart(8)}${'p50'.padStart(8)}${'p90'.padStart(8)}${'p99'.padStart(8)}`
  + `${'sat'.padStart(8)}${'R'.padStart(7)}${'G'.padStart(7)}${'B'.padStart(7)}${'R-B'.padStart(8)}`);
const row = (nm, s) => console.log(`   ${nm.padEnd(22)}${f(s.mean)}${f(s.p50)}${f(s.p90)}${f(s.p99)}`
  + `${f(s.sat, 3)}${f(s.r, 0)}${f(s.g, 0)}${f(s.b, 0)}${f(s.rb, 1)}`);
row('flat (pre-§719)', out.flat);
row('gold (shipped)', out.gold);
const d = (a, b) => a - b;
console.log(`   ${'Δ'.padEnd(22)}${f(d(out.gold.mean, out.flat.mean))}${f(d(out.gold.p50, out.flat.p50))}`
  + `${f(d(out.gold.p90, out.flat.p90))}${f(d(out.gold.p99, out.flat.p99))}`
  + `${f(d(out.gold.sat, out.flat.sat), 3)}${f(d(out.gold.r, out.flat.r), 0)}${f(d(out.gold.g, out.flat.g), 0)}`
  + `${f(d(out.gold.b, out.flat.b), 0)}${f(d(out.gold.rb, out.flat.rb), 1)}`);

console.log('\nD. WHAT MUST NOT HAVE MOVED');
console.log(`   material   ${JSON.stringify(out.mat0)}`);
console.log(`   after arms ${JSON.stringify(out.mat1)}`);
console.log(`   ink shell  ${JSON.stringify(out.shell)}`);

/* ---------------------------------- guards ------------------------------------ */
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const guards = {
  /* instrument */
  I2_null: out.I2 === 0,
  I3_footprint_fires: out.I3 > 100 && out.I3 < 40000,
  I4_restore: out.I4 === 0,
  I5_metal_untouched_by_this_run: same(out.mat0, out.mat1),
  /* A — the classifier, with both of §418.3's inputs in the arm */
  A1_tagged_something: C.tinted.n > 0,
  A2_did_not_tag_everything: C.tinted.n < C.verts,
  A3_owns_the_top_of_the_prop: Math.abs(C.tinted.yhi - C.all.yhi) < 1e-6,
  A4_owns_the_far_reach: Math.abs(C.tinted.rhi - C.all.rhi) < 1e-6,
  A5_does_not_own_the_butt: C.tinted.ylo > C.all.ylo + (C.all.yhi - C.all.ylo) * 0.25,
  A6_ramp_exists: C.ramp.n > 0,
  /* B — the literal still matches the asset it was measured from */
  B1_hook_shell_is_flat: out.albedo.err ? null : out.albedo.hook.length === 1,
  B2_shells_differ: out.albedo.err ? null
    : !out.albedo.rest.some(([k]) => k === out.albedo.hook[0]?.[0] && out.albedo.rest.length === 1),
  /* C — the colour actually moved, in the direction claimed, and only on the hook */
  C1_hue_moved_toward_gold: out.gold.rb - out.flat.rb > 8,
  C2_saturation_rose: out.gold.sat - out.flat.sat > 0.02,
  C3_nothing_else_moved: out.flatOutside === 0,
  /* D — one draw, and the ink is not reading the attribute */
  D1_one_group: C.groups === 1,
  D2_one_material: C.materials === 1,
  D3_ink_ignores_vertex_colour: out.shell.err ? null : out.shell.vertexColors === false,
};
const v = shipVerdict(guards);
console.log('');
for (const [k, s] of Object.entries(v.states)) console.log(`  ${k.padEnd(34)} ${s}`);
console.log(`\n${verdictLine(v, `§719 hook tint on ${out.shot}`)}`);

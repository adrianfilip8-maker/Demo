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
import { writeFileSync, readFileSync } from 'node:fs';
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
 * `tools/shot.mjs` and reports the colour of the hook's pixels in both. Nothing here boots a
 * game, pokes a uniform, or knows what a cane is.
 *
 * IT NEEDS A MASK, AND THAT IS THE POINT RATHER THAN A LIMITATION. Two frames from two separate
 * BOOTS are not bit-comparable in this renderer: measured on this very pair, 22.0 % of the frame
 * differs and the delta histogram decays smoothly from 0 with no floor to threshold at — 78 % of
 * pixels identical, 92 % within 2, and still 33 558 pixels at 8 or more, spread over the whole
 * frame. `tests/canegold3.test.mjs` already forbids exactly this as a bar ("no frame is read back
 * off disk for a pixel bar", §294(2)), and it is right to. So this mode does NOT take "the pixels
 * that differ" as its population — that population is mostly renderer noise. It takes the hook's
 * own footprint, dumped by the in-page run below at the same resolution, and reports the two
 * frames over it. The unmasked diff is still printed, as the honest statement of how noisy a
 * cross-boot pair is.
 *
 *   node tools/canehook.mjs sly-closeup --w 1600 --h 900 --maskout /tmp/hook.json
 *   node tools/canehook.mjs --frames shots/719-before/sly-closeup.png \
 *                                    shots/719-after/sly-closeup.png --mask /tmp/hook.json
 * ------------------------------------------------------------------------------------------ */
const optArg = (name, dflt = null) => { const i = argv.indexOf(name); return i >= 0 ? argv[i + 1] : dflt; };
const fi = argv.indexOf('--frames');
if (fi >= 0) {
  const [A, B] = argv.slice(fi + 1, fi + 3);
  const a = readPNG(A), b = readPNG(B);
  if (a.w !== b.w || a.h !== b.h) throw new Error(`size mismatch: ${a.w}x${a.h} vs ${b.w}x${b.h}`);
  const ch = a.ch;
  const maskFile = optArg('--mask');
  let mask = null;
  if (maskFile) {
    mask = JSON.parse(readFileSync(maskFile, 'utf8'));
    if (mask.w !== a.w || mask.h !== a.h) {
      throw new Error(`mask is ${mask.w}x${mask.h} but the frames are ${a.w}x${a.h} — `
        + 're-run the in-page mode at the frames\' own resolution');
    }
  }
  /* the unmasked diff, reported so the noise is stated rather than hidden */
  let raw = 0, hist = new Array(64).fill(0);
  for (let i = 0; i < a.data.length; i += ch) {
    const d = Math.max(Math.abs(a.data[i] - b.data[i]), Math.abs(a.data[i + 1] - b.data[i + 1]),
      Math.abs(a.data[i + 2] - b.data[i + 2]));
    if (d) raw++;
    hist[Math.min(63, d)]++;
  }
  const idx = [];
  let x0 = 1e9, y0 = 1e9, x1 = -1, y1 = -1;
  const want = mask ? new Uint8Array(a.w * a.h) : null;
  if (mask) for (const p of mask.idx) want[p] = 1;
  for (let y = 0; y < a.h; y++) {
    for (let x = 0; x < a.w; x++) {
      const p = y * a.w + x, i = p * ch;
      if (mask ? !want[p]
        : (a.data[i] === b.data[i] && a.data[i + 1] === b.data[i + 1] && a.data[i + 2] === b.data[i + 2])) continue;
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
  const tot = a.w * a.h;
  const atLeast = (d) => hist.slice(d).reduce((s, v) => s + v, 0);
  console.log(`  CROSS-BOOT NOISE, unmasked: ${raw} of ${tot} px differ at all (${(100 * raw / tot).toFixed(3)}%);`
    + ` within 1: ${(100 * (tot - atLeast(2)) / tot).toFixed(1)}%,  within 2: ${(100 * (tot - atLeast(3)) / tot).toFixed(1)}%,`
    + `  still >=8: ${atLeast(8)} px.  This is why the population below is a MASK and not "what changed".`);
  console.log(`  population: ${mask ? `the hook's own footprint from ${maskFile}` : 'every differing pixel (NOT a bar — see the header)'}`
    + ` — ${idx.length} px`
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

/* `--w/--h` exist so the footprint can be dumped at the RESOLUTION THE SHOTS WERE TAKEN AT —
   a mask is a set of pixel indices and does not survive a resize. */
const positional = argv.filter((a, i) => !a.startsWith('--') && !argv[i - 1]?.startsWith('--'));
const SHOT = positional[0] || 'sly-closeup';
const WIDTH = Number(optArg('--w', 1280));
const HEIGHT = Number(optArg('--h', 720));
const MASKOUT = optArg('--maskout');

/* ── REGISTERED BEFORE THE RUN THAT SCORES IT ────────────────────────────────────────────────
 * The population for C1/C2 is the tag mask at **T = 32**, and that is written down here rather
 * than chosen from the answer.
 *
 * Why not T = 1, "every pixel the tag touched". Measured on a 320x180 pilot: T=1 selects 3,758
 * pixels for a hook whose painted area, estimated independently from the figure's own height
 * (605 px at 900 rows -> 121 px at 180; a crook ~40 px tall with a ~2 px stroke is ~240 px of
 * surface), is about 240. T=16 selects 241. The 15x overcount at T=1 is the BLOOM HALO: making
 * the hook a different colour changes how much it blooms, and bloom is a global operator, so its
 * halo moves with the hook without being the hook. That is a wrong population, identified by
 * arithmetic that does not depend on the candidate, not a bar chosen for being flattering.
 *
 * Why 32 and not 16: at the pilot's resolution EVERY pixel of a 2 px stroke is an anti-aliased
 * blend with the background, so no threshold there can isolate the hook's own surface — which is
 * why this is scored at the shots' 1600x900, where the stroke is ~10 px and has an interior.
 * T=32 keeps the pixels the magenta tag dominated, i.e. the ones the hook substantially covers.
 *
 * The whole sweep is printed either way. If the conclusion moves with T, that is visible.
 * ────────────────────────────────────────────────────────────────────────────────────────── */
const SWEEP = [1, 16, 32, 64];
const SCORE_AT = 32;

const out = await withGame({ width: WIDTH, height: HEIGHT, quality: 'high' }, async ({ page }) => {
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

    /* The frame's own draw/triangle counters, read in the SAME boot for every arm.
       `shots/<run>/manifest.json` carries this column too, but comparing it across two runs is
       comparing two boots — and two boots of this renderer disagree on 22 % of their pixels, so
       a ±2 there says nothing. Read per arm here, the question "did the tint change the draw
       count" has an exact answer: base, flat and restore must agree to the unit. */
    W.__info = () => {
      const r = W.__ENGINE.renderer.info.render;
      return { calls: r.calls, triangles: r.triangles, programs: W.__ENGINE.renderer.info.programs?.length ?? null };
    };
    W.__snap = async (key, shot) => {
      const r = await W.__GAME.setShot(shot, { dt: 0 });
      W.__INFO = W.__INFO || {};
      W.__INFO[key] = W.__info();
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
    /* "did anything else move" has to distinguish a HALO from a leak, and the difference is
       distance. Making the hook less bright makes the BLOOM around it less bright — that is a
       global operator doing its job on a local change, not a defect — so pixels just outside the
       footprint are expected to move. Pixels far from it are not. `far` counts outside a bbox
       dilated by `pad`; `halo` counts the rest. This is `canegold.mjs`'s G4' split, reused. */
    W.__outside = (a, b, idx, pad) => {
      const A = W.__CAP[a], B = W.__CAP[b], w = A.w;
      const inMask = new Uint8Array(A.d.length / 4);
      let x0 = 1e9, y0 = 1e9, x1 = -1, y1 = -1;
      for (const i of idx) {
        inMask[i / 4] = 1;
        const p = i / 4, x = p % w, y = (p / w) | 0;
        if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
      }
      x0 -= pad; y0 -= pad; x1 += pad; y1 += pad;
      let n = 0, far = 0, halo = 0;
      for (let i = 0; i < A.d.length; i += 4) {
        if (inMask[i / 4]) continue;
        if (A.d[i] === B.d[i] && A.d[i + 1] === B.d[i + 1] && A.d[i + 2] === B.d[i + 2]) continue;
        const p = i / 4, x = p % w, y = (p / w) | 0;
        n++;
        if (x < x0 || x > x1 || y < y0 || y > y1) far++; else halo++;
      }
      return { n, far, halo, box: [x0, y0, x1, y1] };
    };
    /* The footprint at a series of tag-delta thresholds. The tag turns the hook's albedo
       magenta, which moves its own pixels enormously and its bloom halo only a little, so a
       threshold separates the two — but a threshold is a choice, and a choice made after seeing
       the answer is not a measurement. So every threshold is reported and the delta is quoted at
       all of them: either the conclusion is the same across the sweep, in which case the choice
       does not matter, or it is not, in which case the reader gets to see that. */
    W.__maskAt = (T) => {
      const A = W.__CAP.base, B = W.__CAP.tag, idx = [];
      for (let i = 0; i < A.d.length; i += 4) {
        const d = Math.max(Math.abs(A.d[i] - B.d[i]), Math.abs(A.d[i + 1] - B.d[i + 1]), Math.abs(A.d[i + 2] - B.d[i + 2]));
        if (d >= T) idx.push(i);
      }
      return idx;
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
    const A = window.__CAP.base;
    let x0 = 1e9, y0 = 1e9, x1 = -1, y1 = -1;
    for (const i of d.idx) {
      const p = i / 4, x = p % A.w, y = (p / A.w) | 0;
      if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
    }
    return { n: d.n, w: A.w, h: A.h, box: [x0, y0, x1, y1], idx: d.idx.map((i) => i / 4) };
  });
  R.I3 = mask.n;
  R.box = mask.box;
  if (MASKOUT) {
    writeFileSync(MASKOUT, JSON.stringify({ shot: SHOT, w: mask.w, h: mask.h, idx: mask.idx }));
    console.log(`· hook footprint (${mask.n} px at ${mask.w}x${mask.h}) written to ${MASKOUT}`);
  }

  /* --- C1 the pre-§719 albedo: the hook's COLOR_0 back to white -------------------------
     Bit-for-bit the state before this section: the material multiplies by COLOR_0, and
     `1 + (c - 1) * 0` is exactly 1 on any driver, so the "before" arm is exact and not
     approximate. */
  await page.evaluate(([s]) => { window.__setHook([1, 1, 1]); return window.__snap('flat', s); }, [SHOT]);
  R.sweep = [];
  for (const T of SWEEP) {
    const row = await page.evaluate(([t]) => {
      const idx = window.__maskAt(t);
      return { T: t, n: idx.length, flat: window.__stats('flat', idx), gold: window.__stats('base', idx) };
    }, [T]);
    R.sweep.push(row);
  }
  R.scored = R.sweep.find((s) => s.T === SCORE_AT) || R.sweep[0];
  R.flat = R.scored.flat;
  R.gold0 = R.scored.gold;
  R.flatOutside = await page.evaluate(() => window.__outside('base', 'flat', window.__MASK, 16));

  /* --- I4 restore: MUST re-equal base ---------------------------------------------------- */
  await page.evaluate(([s]) => { window.__setHook(null); return window.__snap('restore', s); }, [SHOT]);
  R.I4 = (await page.evaluate(() => window.__diff('base', 'restore'))).n;
  R.gold = await page.evaluate(() => window.__stats('base', window.__MASK));
  R.mat1 = await page.evaluate(() => window.__matState());
  R.info = await page.evaluate(() => window.__INFO);

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
console.log(`   |hook footprint| = ${out.I3} px  bbox ${JSON.stringify(out.box)}`
  + `    (I2 null ${out.I2} px, I4 restore ${out.I4} px)`);
console.log(`   outside the footprint, base vs flat: ${out.flatOutside.n} px moved — `
  + `${out.flatOutside.halo} in the 16 px halo (the bloom following the hook down), `
  + `${out.flatOutside.far} FAR (must be 0)`);
console.log('   THRESHOLD SWEEP on the tag delta. T=0 is every pixel the magenta tag touched,');
console.log('   which includes its bloom halo; higher T keeps the hook\'s own surface. The');
console.log('   conclusion has to survive the whole sweep or the threshold is doing the work.');
console.log(`   ${'population'.padEnd(22)}${'n'.padStart(7)}${'meanL'.padStart(8)}${'p50'.padStart(8)}${'p90'.padStart(8)}`
  + `${'p99'.padStart(8)}${'sat'.padStart(8)}${'R'.padStart(7)}${'G'.padStart(7)}${'B'.padStart(7)}${'R-B'.padStart(8)}`);
const d = (a, b) => a - b;
for (const s of out.sweep) {
  if (!s.n) { console.log(`   T=${s.T}  population empty`); continue; }
  const mark = s.T === SCORE_AT ? ' <- SCORED' : '';
  const row = (nm, st, n) => console.log(`   ${nm.padEnd(22)}${String(n).padStart(7)}${f(st.mean)}${f(st.p50)}`
    + `${f(st.p90)}${f(st.p99)}${f(st.sat, 3)}${f(st.r, 0)}${f(st.g, 0)}${f(st.b, 0)}${f(st.rb, 1)}`);
  row(`T=${s.T} flat (pre-§719)${mark}`, s.flat, s.n);
  row(`T=${s.T} gold (shipped)`, s.gold, '');
  console.log(`   ${`T=${s.T} Δ`.padEnd(22)}${''.padStart(7)}${f(d(s.gold.mean, s.flat.mean))}`
    + `${f(d(s.gold.p50, s.flat.p50))}${f(d(s.gold.p90, s.flat.p90))}${f(d(s.gold.p99, s.flat.p99))}`
    + `${f(d(s.gold.sat, s.flat.sat), 3)}${f(d(s.gold.r, s.flat.r), 0)}${f(d(s.gold.g, s.flat.g), 0)}`
    + `${f(d(s.gold.b, s.flat.b), 0)}${f(d(s.gold.rb, s.flat.rb), 1)}   sat rel `
    + `${(100 * (s.gold.sat / s.flat.sat - 1)).toFixed(1)}%`);
}

console.log('\nD. WHAT MUST NOT HAVE MOVED');
console.log(`   material   ${JSON.stringify(out.mat0)}`);
console.log(`   after arms ${JSON.stringify(out.mat1)}`);
console.log(`   ink shell  ${JSON.stringify(out.shell)}`);
console.log('   frame counters, same boot, per arm (renderer.info.render):');
for (const [k, v] of Object.entries(out.info || {})) {
  console.log(`     ${k.padEnd(9)} calls ${String(v.calls).padStart(4)}   triangles ${String(v.triangles).padStart(9)}   programs ${v.programs}`);
}

/* ---------------------------------- guards ------------------------------------ */
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const guards = {
  /* instrument */
  I2_null: out.I2 === 0,
  /* Two-sided, and the upper bound is a FRACTION of the frame rather than a literal: canegold's
     run 1 passed a lower-bound-only control on a mask 20x too large, and a cane hook that paints
     a tenth of the frame is not a cane hook. */
  I3_footprint_fires: out.I3 > 100 && out.I3 < 0.10 * WIDTH * HEIGHT,
  I3b_scored_population_exists: out.scored.n > 50,
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
  /* C — the colour actually moved, in the direction claimed, and only on the hook.
     C1 WAS REGISTERED BEFORE ANY DATA EXISTED and is kept exactly as first written, including
     when it fails: the albedo's own red-minus-blue rises by 67 points from #ffe29c to #e8b942, so
     "the rendered R-B rises too" looked like the obvious bar. It is a BAD bar, and the run is
     what shows that — the change also darkens the surface ~16 %, and R-B is an ABSOLUTE spread
     that a proportional darkening pulls back down. Saturation, the RELATIVE spread, is the
     quantity that survives the darkening, which is why C2 is the discriminator that works.
     Recorded rather than quietly rewritten: §266's whole lesson is that a bar which fails is
     evidence, and a bar edited after the fact is not a bar. */
  C1_hue_moved_toward_gold_REGISTERED: out.scored.n > 0 ? out.gold0.rb - out.flat.rb > 8 : null,
  C2_saturation_rose: out.scored.n > 0 ? out.scored.gold.sat - out.scored.flat.sat > 0.02 : null,
  C3_nothing_far_from_the_hook_moved: out.flatOutside.far === 0,
  /* D — one draw, and the ink is not reading the attribute */
  D1_one_group: C.groups === 1,
  D2_one_material: C.materials === 1,
  D3_ink_ignores_vertex_colour: out.shell.err ? null : out.shell.vertexColors === false,
  /* The FIRST setShot of a boot reads a couple of draws above steady state — measured, and it is
     why `shots/<run>/manifest.json`'s column cannot be compared across two runs like for like.
     The tint's effect on the frame's cost is the STEADY-STATE arms against each other. */
  D4_draws_unmoved_by_the_tint: !out.info?.base2 || !out.info?.flat ? null
    : out.info.base2.calls === out.info.flat.calls
      && out.info.base2.calls === out.info.tag?.calls
      && out.info.base2.calls === out.info.restore?.calls,
  D5_triangles_unmoved_by_the_tint: !out.info?.base2 || !out.info?.flat ? null
    : out.info.base2.triangles === out.info.flat.triangles
      && out.info.base2.triangles === out.info.tag?.triangles
      && out.info.base2.triangles === out.info.restore?.triangles,
};
const v = shipVerdict(guards);
console.log('');
for (const [k, s] of Object.entries(v.states)) console.log(`  ${k.padEnd(34)} ${s}`);
console.log(`\n${verdictLine(v, `§719 hook tint on ${out.shot}`)}`);

/**
 * inkw — how many PIXELS wide is the ink, per contributing pass, per shot, per resolution?
 *
 * The critic measured "1 px on one character, 29 px on another in the same frame" with a
 * dark-pixel extractor. A dark-pixel extractor cannot tell an ink line from a cel shadow, a
 * terminator, or a character who is simply dark: Sly is a blue-black raccoon and his own
 * albedo is darker than several of the ink colours in the palette. So this tool does not look
 * for dark pixels at all.
 *
 * ## The extractor
 *
 * **Ink is what the ink passes DARKENED.** Every arm is captured in one boot, from one staged
 * frame, with only one lever moved; the mask for a pass is the set of pixels that got darker
 * when that pass was switched on. A cel shadow, the terminator, and Sly's own albedo are
 * present in both arms and cancel to zero — they cannot enter the mask no matter how dark they
 * are. Nothing here thresholds absolute luminance.
 *
 * **Width is the minimum chord through the mask.** For each mask pixel, take the length of the
 * maximal run of mask pixels through it along four axes (horizontal, vertical, both diagonals)
 * and keep the SMALLEST. For a straight band of thickness t the minimum chord is exactly t at
 * 0/45/90 degrees and never worse than 1.08 t in between, and — the property that matters —
 * it does not grow when the band is long. A run-length or dark-pixel-count estimator reports a
 * horizontal ink line as hundreds of pixels wide; this reports it as its thickness.
 *
 * The distinction the whole exercise turns on: a LINE has a small minimum chord everywhere
 * along it, a SMEAR does not. Median chord is the line weight; p99 and max say whether the
 * pass is also painting blobs.
 *
 * ## Arms
 *
 *   base      everything on                                  the subject
 *   nohull    shading.setOutlinesVisible(false)               inverted-hull shells off
 *   noink     postfx.tune.inkStrength = 0                     screen-space crease ink off
 *   noao      postfx.setEnabled('ao', false)                  ambient occlusion off
 *   nochar    character.root.visible = false                  CALIBRATION + subject box
 *   hull2x    every ink material's uThickness x2              CALIBRATION (width sensitivity)
 *   null      nothing poked, captured last                    CALIBRATION (drift floor)
 *
 * ## The three calibration arms, and what each one proves
 *
 *   null   MUST report 0 changed pixels against base. §220 measured a 3087/57600 px drift
 *          floor between captures four frames apart; every arm here therefore renders at
 *          dt = 0 and the null is what proves the clock actually stood still. A non-zero null
 *          voids every number in the run.
 *   nochar MUST move a large number of pixels. It is the "does anything move a pixel at all"
 *          control §218 says two of its three voided probes lacked: the arms below poke a
 *          uniform and force a render WITHOUT going back through setShot, and if that path
 *          were dead every arm would silently report the base frame and every mask would be
 *          empty. An empty mask and a working pass are indistinguishable without this.
 *   hull2x MUST widen the hull band. A mask can be non-empty and the width estimator still be
 *          blind — this doubles a known input and requires the output to follow it. Without
 *          it, "the hull measures 3 px" is a number with no demonstrated relationship to the
 *          thing it claims to measure.
 *
 * FXAA is off in every arm by default (`--fxaa` to keep it): it is a spatial filter running
 * after the composite, so it spreads every one-pixel change into its neighbours and adds
 * roughly a pixel to any width measured through it. The `fxaa` arm quantifies that.
 *
 * Run:
 *   node progress/records/inkw.mjs --shots courtyard,temple,hero,combat,sly-closeup
 *   node progress/records/inkw.mjs --shots courtyard,hero --w 640 --h 360 --tag lo
 */
import { withGame, grab, ROOT } from '../../tools/harness.mjs';
import { readPNG } from '../../tools/png.mjs';
import { writeFileSync, mkdirSync, existsSync } from 'node:fs';
import path from 'node:path';

const argv = process.argv.slice(2);
const arg = (k, d) => {
  const i = argv.indexOf(`--${k}`);
  return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : d;
};
const has = (k) => argv.includes(`--${k}`);

const SHOTS = arg('shots', 'courtyard,temple,hero,combat,sly-closeup').split(',').filter(Boolean);
/* Resolutions are swept INSIDE one boot by resizing the viewport, so the resolution arms share
   a scene, a staging and a clock — the only thing that differs between them is the pixel grid. */
const RES = arg('res', '1280x720').split(',').map((s) => {
  const [w, h] = s.split('x').map((v) => parseInt(v, 10));
  return { w, h };
});
const W = RES[0].w, H = RES[0].h;
const TAG = arg('tag', RES.map((r) => `${r.w}x${r.h}`).join('_'));
const KEEP_FXAA = has('fxaa');
const OUT = path.join(ROOT, 'progress/records', arg('out', `inkw-${TAG}`));

/* Luma threshold, in 0..255, for "this pass changed this pixel". 4 is above the composite's
   static dither (uGrain is a fixed per-pixel pattern, identical in every arm, so it cancels
   except where a value crosses a quantisation boundary — a 1 LSB effect) and far below any
   ink contribution: the ink colours are #1a1210 / #161022 against surfaces at L 60-160. */
const T = 4;

const luma = (r, g, b) => 0.2126 * r + 0.7152 * g + 0.0722 * b;

function toLuma(im) {
  const n = im.w * im.h;
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const j = i * im.ch;
    out[i] = luma(im.data[j], im.data[j + 1], im.data[j + 2]);
  }
  return out;
}

/* ---------------------------------------------------------------- min chord --- */

/** Maximal run length of set pixels through each pixel, along (dx,dy). */
function runLengths(mask, w, h, dx, dy) {
  const len = new Uint16Array(w * h);
  const starts = [];
  if (dx === 1 && dy === 0) { for (let y = 0; y < h; y++) starts.push([0, y]); }
  else if (dx === 0 && dy === 1) { for (let x = 0; x < w; x++) starts.push([x, 0]); }
  else if (dx === 1 && dy === 1) {
    for (let y = 0; y < h; y++) starts.push([0, y]);
    for (let x = 1; x < w; x++) starts.push([x, 0]);
  } else { // (1,-1)
    for (let y = 0; y < h; y++) starts.push([0, y]);
    for (let x = 1; x < w; x++) starts.push([x, h - 1]);
  }
  const line = [];
  for (const [sx, sy] of starts) {
    line.length = 0;
    for (let x = sx, y = sy; x >= 0 && x < w && y >= 0 && y < h; x += dx, y += dy) line.push(y * w + x);
    let i = 0;
    while (i < line.length) {
      if (!mask[line[i]]) { i++; continue; }
      let j = i;
      while (j < line.length && mask[line[j]]) j++;
      const n = j - i;
      for (let k = i; k < j; k++) len[line[k]] = n;
      i = j;
    }
  }
  return len;
}

/** Minimum chord through each mask pixel, over the four axes. 0 where the mask is unset. */
function minChord(mask, w, h) {
  const a = runLengths(mask, w, h, 1, 0);
  const b = runLengths(mask, w, h, 0, 1);
  const c = runLengths(mask, w, h, 1, 1);
  const d = runLengths(mask, w, h, 1, -1);
  const out = new Uint16Array(w * h);
  for (let i = 0; i < out.length; i++) {
    if (!mask[i]) continue;
    /* Diagonal runs are counted in diagonal steps, each sqrt(2) px long. Rounding rather
       than flooring keeps a 1 px diagonal line at 1 rather than collapsing it to 0. */
    const cd = Math.round(c[i] * Math.SQRT2), dd = Math.round(d[i] * Math.SQRT2);
    out[i] = Math.min(a[i], b[i], cd, dd);
  }
  return out;
}

function stats(chord, region) {
  const vals = [];
  for (let i = 0; i < chord.length; i++) if (chord[i] && (!region || region[i])) vals.push(chord[i]);
  if (!vals.length) return { n: 0 };
  vals.sort((x, y) => x - y);
  const q = (p) => vals[Math.min(vals.length - 1, Math.floor(p * vals.length))];
  return {
    n: vals.length,
    med: q(0.5), p75: q(0.75), p90: q(0.90), p99: q(0.99), max: vals[vals.length - 1],
    mean: +(vals.reduce((s, v) => s + v, 0) / vals.length).toFixed(2),
  };
}

/**
 * Width against distance from the frame CENTRE.
 *
 * Added after an offline reproduction of `OUTLINE_VERT` in plain three arithmetic
 * (`pushrepro.mjs`) showed that `mvPosition.z *= 1.0 + uDepthPush` scales `gl_Position.w` while
 * leaving `gl_Position.xy` alone, so after the perspective divide the whole hull is displaced
 * radially toward the frame centre by `(1 - 1/k)` of the vertex's NDC radius — 0.9 px at NDC
 * 0.42 and 2.1 px at NDC 1.0 at 1920x1080. The ink offset itself is exactly preserved (2.500000
 * px at z = -2, -10 and -60, with and without the push), so this is a DISPLACEMENT, not a width
 * change: the line goes thin on the outward-facing side of a form and thick on the inward-facing
 * side, and the mean is exactly conserved. A median or a mean therefore cannot see it at all, and
 * that is precisely why this statistic exists — the defect lives in the SPREAD, and only in the
 * outer frame.
 *
 * Ring boundaries are on NDC radius normalised so the frame corner is 1.0.
 */
function radial(chord, W, H, region) {
  const inner = [], outer = [];
  const norm = Math.hypot(1, 1);
  for (let i = 0; i < chord.length; i++) {
    if (!chord[i] || (region && !region[i])) continue;
    const x = i % W, y = (i / W) | 0;
    const r = Math.hypot(x / W * 2 - 1, y / H * 2 - 1) / norm;
    (r < 0.40 ? inner : r > 0.70 ? outer : null)?.push(chord[i]);
  }
  const s = (v) => {
    if (!v.length) return { n: 0 };
    v.sort((a, b) => a - b);
    const q = (p) => v[Math.min(v.length - 1, Math.floor(p * v.length))];
    return { n: v.length, med: q(0.5), p05: q(0.05), p95: q(0.95),
             spread: +(q(0.95) / Math.max(1, q(0.05))).toFixed(2) };
  };
  return { inner: s(inner), outer: s(outer) };
}

/* ------------------------------------------------------------ estimator test --- */

/** The width estimator against lines of known width at 0, 45 and 90 degrees. */
function selfTest() {
  const w = 128, h = 128, rows = [];
  for (const t of [1, 2, 3, 5, 9]) {
    for (const ang of ['h', 'v', 'd']) {
      const m = new Uint8Array(w * h);
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        let inside = false;
        if (ang === 'h') inside = y >= 60 && y < 60 + t;
        else if (ang === 'v') inside = x >= 60 && x < 60 + t;
        else {
          // Band of perpendicular thickness t about the line y = x.
          const dist = Math.abs(x - y) / Math.SQRT2;
          inside = dist < t / 2;
        }
        if (inside) m[y * w + x] = 1;
      }
      const s = stats(minChord(m, w, h), null);
      rows.push({ t, ang, med: s.med, max: s.max, n: s.n });
    }
  }
  return rows;
}

/* -------------------------------------------------------------- connected cc --- */

/** Bounding box of the largest 4-connected component of `mask`. */
function largestBox(mask, w, h) {
  const seen = new Uint8Array(w * h);
  const stack = new Int32Array(w * h);
  let best = null;
  for (let s = 0; s < mask.length; s++) {
    if (!mask[s] || seen[s]) continue;
    let sp = 0; stack[sp++] = s; seen[s] = 1;
    let n = 0, x0 = 1e9, y0 = 1e9, x1 = -1, y1 = -1;
    while (sp) {
      const i = stack[--sp];
      const x = i % w, y = (i / w) | 0;
      n++;
      if (x < x0) x0 = x; if (x > x1) x1 = x;
      if (y < y0) y0 = y; if (y > y1) y1 = y;
      if (x > 0 && mask[i - 1] && !seen[i - 1]) { seen[i - 1] = 1; stack[sp++] = i - 1; }
      if (x < w - 1 && mask[i + 1] && !seen[i + 1]) { seen[i + 1] = 1; stack[sp++] = i + 1; }
      if (y > 0 && mask[i - w] && !seen[i - w]) { seen[i - w] = 1; stack[sp++] = i - w; }
      if (y < h - 1 && mask[i + w] && !seen[i + w]) { seen[i + w] = 1; stack[sp++] = i + w; }
    }
    if (!best || n > best.n) best = { n, x0, y0, x1, y1 };
  }
  return best;
}

/* ------------------------------------------------------------------ in-page --- */

const POKES = {
  base: () => {},
  /* NOT `shading.setOutlinesVisible(false)`. `PostFX._renderChain` calls `beginNormalPass()` /
     `endNormalPass()` every frame, and the second of those sets shell visibility back to TRUE — so
     that poke is overwritten before the capture and the arm silently measures nothing. The first
     baseline run lost its whole hull arm to exactly that. `material.visible` is checked in
     `WebGLRenderer.projectObject` and nothing in the frame loop rewrites it. */
  nohull: () => {
    let n = 0;
    for (const m of window.__ENGINE.get('shading')._inkCache.values()) { m.visible = false; n++; }
    window.__INKW_HULLMATS = n;
  },
  noink: () => { window.__ENGINE.get('postfx').tune.inkStrength = 0; },
  noao: () => { window.__ENGINE.get('postfx').setEnabled('ao', false); },
  nochar: () => { window.__ENGINE.get('character').root.visible = false; },
  /* Both levers, so the arm means the same thing before and after the fix: before, nothing
     rewrites `uThickness` and the uniform poke does the work; after, the per-frame resolution sync
     overwrites the uniform and `userData.slyInkScale` does it instead. Either way the hull is
     exactly 2x, which is what the calibration asserts. */
  hull2x: () => {
    const sh = window.__ENGINE.get('shading');
    let n = 0;
    for (const m of sh._inkCache.values()) {
      m.userData.slyInkScale = (m.userData.slyInkScale ?? 1) * 2;
      m.uniforms.uThickness.value *= 2;
      n++;
    }
    window.__INKW_CALIB = n;
  },
  fxaa: () => { window.__ENGINE.get('postfx').setEnabled('fxaa', !window.__INKW_FXAA0); },

  /* THE BEFORE ARM, in the same boot as the after arm.
   *
   * Restores the pre-fix renderer exactly, from values READ BACK OFF THE LIVE UNIFORMS rather than
   * from arithmetic re-implemented here — so this arm cannot disagree with the shipped code about
   * what the shipped code does:
   *
   *   hull      uThickness := 2.5 at every resolution. That IS the old model: `INK_PX` was a
   *             device-pixel constant and `tests/ink.test.mjs` locked every call site to it.
   *   crease    the applied radius is `edgeThickness * inkResScale(rows)`, and `inkResScale(rows)`
   *             is exactly `appliedHullPx / 2.5` — so dividing `tune.edgeThickness` by that ratio
   *             returns the applied radius to its old 1.5 px without this file knowing the formula.
   *   planarity `edgePlanar[2] = 0` collapses the gate's mix to 1.0, which PostFX documents as
   *             bit-exactly the ungated behaviour.
   *
   * Why this beats a cross-commit before/after: same boot, same clock, same staging, same
   * SwiftShader, and a null arm that proves the pair differ by zero when nothing is poked. §193's
   * cross-boot floor does not apply to a difference taken inside one boot.
   *
   * The readback is recorded so an arm that silently collapsed is visible rather than inferred
   * (§249's discipline: prove the lever reached the shader, never assume it).
   */
  legacy: () => { window.__INKW_LEGACY_ON(); },
  legacy_nohull: () => {
    window.__INKW_LEGACY_ON();
    for (const m of window.__ENGINE.get('shading')._inkCache.values()) m.visible = false;
  },
};

const RESTORE = {
  base: () => {},
  nohull: () => { for (const m of window.__ENGINE.get('shading')._inkCache.values()) m.visible = true; },
  noink: () => { window.__ENGINE.get('postfx').tune.inkStrength = window.__INKW_INK0; },
  noao: () => { window.__ENGINE.get('postfx').setEnabled('ao', true); },
  nochar: () => { window.__ENGINE.get('character').root.visible = true; },
  hull2x: () => {
    for (const m of window.__ENGINE.get('shading')._inkCache.values()) {
      m.userData.slyInkScale = (m.userData.slyInkScale ?? 2) / 2;
      m.uniforms.uThickness.value /= 2;
    }
  },
  fxaa: () => { window.__ENGINE.get('postfx').setEnabled('fxaa', window.__INKW_FXAA0); },
  legacy: () => { window.__INKW_LEGACY_OFF(); },
  legacy_nohull: () => {
    window.__INKW_LEGACY_OFF();
    for (const m of window.__ENGINE.get('shading')._inkCache.values()) m.visible = true;
  },
};

/* Installed once per boot; the two legacy arms call it. Kept out of POKES so the save/restore
   state lives in one place and cannot be half-applied by one arm and half-undone by another. */
const LEGACY_SETUP = () => {
  const sh = window.__ENGINE.get('shading');
  const p = window.__ENGINE.get('postfx');
  window.__INKW_LEGACY_ON = () => {
    const saved = [];
    let scale = 1;
    for (const m of sh._inkCache.values()) {
      const applied = m.uniforms.uThickness.value;
      scale = applied / 2.5;                       // == inkResScale(rows), read back not recomputed
      saved.push([m, applied]);
      m.uniforms.uThickness.value = 2.5;           // the old model: INK_PX at every resolution
    }
    window.__INKW_SAVED = saved;
    window.__INKW_ET = p.tune.edgeThickness;
    window.__INKW_EP = p.tune.edgePlanar.slice();
    p.tune.edgeThickness = window.__INKW_ET / (scale || 1);
    p.tune.edgePlanar[2] = 0;
    /* Readback, so a collapsed arm is visible. `applied` is what the shader will receive. */
    window.__INKW_READBACK = {
      resScale: +scale.toFixed(4),
      hullPxNow: sh._inkCache.size ? [...sh._inkCache.values()][0].uniforms.uThickness.value : null,
      creaseAppliedNow: +(p.tune.edgeThickness * scale).toFixed(4),
      planarStrength: p.tune.edgePlanar[2],
    };
  };
  window.__INKW_LEGACY_OFF = () => {
    for (const [m, v] of (window.__INKW_SAVED || [])) m.uniforms.uThickness.value = v;
    if (window.__INKW_ET != null) p.tune.edgeThickness = window.__INKW_ET;
    if (window.__INKW_EP) p.tune.edgePlanar = window.__INKW_EP.slice();
  };
};

async function armCapture(page, arm) {
  return page.evaluate(async (name) => {
    const P = window.__INKW_POKE, R = window.__INKW_RESTORE;
    P[name]();
    /* Force real renders. §218: `G.step(n, 0)` does not render, so stepping is not enough.
       `renderFrame(0)` runs the full module update + PostFX chain with the clock frozen, and
       `capture()` runs one more before it reads the buffer. The `nochar` arm is the control
       that this path is live at all. */
    for (let i = 0; i < 3; i++) {
      window.__ENGINE.renderFrame(0);
      await new Promise((r) => setTimeout(r, 0));
    }
    const url = window.__GAME.capture('image/png');
    R[name]();
    for (let i = 0; i < 2; i++) {
      window.__ENGINE.renderFrame(0);
      await new Promise((r) => setTimeout(r, 0));
    }
    return url;
  }, arm);
}

/* ---------------------------------------------------------------------- run --- */

const ARMS = ['base', 'nohull', 'noink', 'noao', 'nochar', 'hull2x', 'legacy', 'legacy_nohull', 'null'];

async function main() {
  if (!existsSync(OUT)) mkdirSync(OUT, { recursive: true });

  const st = selfTest();
  console.log('\n== estimator self-test (min chord on synthetic bands) ==');
  let stOK = true;
  for (const r of st) {
    const ok = Math.abs(r.med - r.t) <= Math.max(1, r.t * 0.15);
    if (!ok) stOK = false;
    console.log(`  t=${String(r.t).padStart(2)} ${r.ang}  median=${String(r.med).padStart(2)}  max=${String(r.max).padStart(2)}  ${ok ? 'ok' : 'FAIL'}`);
  }
  if (!stOK) { console.log('\n!! estimator self-test FAILED — nothing below means anything'); process.exit(2); }
  if (has('selfonly')) return;

  /* Re-analyse frames already on disk, taking no lock and booting nothing. The analysis is the
     part that gets extended as the investigation learns what to look at, and re-deriving a
     statistic must never mean re-capturing: the before arm and the after arm have to go through
     the SAME analyser, and this is what makes that possible after the before arm has been shot. */
  if (has('analyse')) {
    const dir = path.join(ROOT, 'progress/records', arg('analyse', ''));
    const out = [];
    for (const res of RES) for (const shot of SHOTS) {
      const files = {};
      let ok = true;
      /* `fxaa` and the two legacy arms are optional so the analyser can read BOTH runs: the first
         baseline predates the legacy arms and the candidate dropped `fxaa`. Everything the
         calibrations need is required. */
      const OPTIONAL = new Set(['fxaa', 'legacy', 'legacy_nohull']);
      for (const a of [...ARMS, 'fxaa']) {
        const f = path.join(dir, `${res.w}x${res.h}-${shot}-${a}.png`);
        if (!existsSync(f)) { if (!OPTIONAL.has(a)) { ok = false; break; } continue; }
        files[a] = f;
      }
      if (ok) out.push({ res, shot, files, calibMats: null });
    }
    if (!out.length) { console.log(`no frames under ${dir}`); process.exit(2); }
    report(dir, { out, renderer: '(offline re-analysis)', warnings: 0 }, st);
    return;
  }

  /* ONE BOOT PER RESOLUTION. Sweeping resolutions inside a live boot with `setViewportSize`
     resized the canvas (the drawing buffer readback confirmed it) and then rendered nothing:
     every frame of the first run's 640x360 block came back exactly 0 in all channels. Booting
     at the target viewport is the harness's own path and is known to work. It costs a lock
     acquisition per resolution, which is the price of the arm being real. */
  const out = [];
  let renderer = '?', warnings = 0;
  for (const res of RES) {
    const r = await withGame({ width: res.w, height: res.h, quality: 'high', verbose: false }, async ({ page, info }) => {
      await page.evaluate(([pokes, restores, setup, keepFxaa]) => {
        window.__INKW_POKE = Object.fromEntries(Object.entries(pokes).map(([k, v]) => [k, new Function(`return (${v})`)()]));
        window.__INKW_RESTORE = Object.fromEntries(Object.entries(restores).map(([k, v]) => [k, new Function(`return (${v})`)()]));
        new Function(`return (${setup})`)()();
        const p = window.__ENGINE.get('postfx');
        window.__INKW_INK0 = p.tune.inkStrength;
        window.__INKW_FXAA0 = !!keepFxaa;
        p.setEnabled('fxaa', !!keepFxaa);
      }, [
        Object.fromEntries(Object.entries(POKES).map(([k, v]) => [k, v.toString()])),
        Object.fromEntries(Object.entries(RESTORE).map(([k, v]) => [k, v.toString()])),
        LEGACY_SETUP.toString(),
        KEEP_FXAA,
      ]);

      const got = await page.evaluate(() => {
        window.__ENGINE.renderFrame(0);
        return [window.__ENGINE.canvas.width, window.__ENGINE.canvas.height];
      });
      console.log(`\n== ${res.w}x${res.h} (drawing buffer ${got[0]}x${got[1]}) ==`);

      const rows = [];
      for (const shot of SHOTS) {
        process.stdout.write(`\n[${shot}] `);
        const staged = await page.evaluate((n) => window.__GAME.setShot(n, { dt: 0 }), shot);
        const files = {};
        for (const arm of ARMS) {
          process.stdout.write(`${arm} `);
          const url = await armCapture(page, arm === 'null' ? 'base' : arm);
          const f = path.join(OUT, `${res.w}x${res.h}-${shot}-${arm}.png`);
          writeFileSync(f, Buffer.from(url.split(',')[1], 'base64'));
          files[arm] = f;
        }
        const calib = await page.evaluate(() => [window.__INKW_CALIB ?? 0, window.__INKW_HULLMATS ?? 0, window.__INKW_READBACK ?? null]);
        rows.push({ res, buf: got, shot, files, subject: staged.subject,
                    calibMats: calib[0], hullMats: calib[1], readback: calib[2] });
      }
      return { rows, renderer: info.renderer, warnings: info.warnings.length };
    });
    out.push(...r.rows);
    renderer = r.renderer;
    warnings += r.warnings;
  }

  report(OUT, { out, renderer, warnings }, st);
}

function report(OUT, results, st) {
  console.log(`\n\nrenderer: ${results.renderer}   boot warnings: ${results.warnings}`);
  const report = { tag: TAG, res: RES, fxaa: KEEP_FXAA, selfTest: st, shots: [] };

  for (const r of results.out) {
    const im = {};
    let W = 0, H = 0;
    for (const a of ARMS) {
      if (!r.files[a]) continue;
      const p = readPNG(r.files[a]); W = p.w; H = p.h; im[a] = toLuma(p);
    }
    const n = im.base.length;

    // --- calibration 1: null must be byte-exact against base
    let nullDiff = 0, nullMax = 0;
    for (let i = 0; i < n; i++) {
      const d = Math.abs(im.null[i] - im.base[i]);
      if (d > 0.5) nullDiff++;
      if (d > nullMax) nullMax = d;
    }

    // --- calibration 2: nochar must move a lot of pixels; also gives the subject box
    const charMask = new Uint8Array(n);
    let charN = 0;
    for (let i = 0; i < n; i++) if (Math.abs(im.nochar[i] - im.base[i]) >= T) { charMask[i] = 1; charN++; }
    const box = largestBox(charMask, W, H);

    // Region = the subject's box, padded, so per-character numbers exclude the architecture.
    const region = new Uint8Array(n);
    if (box) {
      const pad = 6;
      for (let y = Math.max(0, box.y0 - pad); y <= Math.min(H - 1, box.y1 + pad); y++)
        for (let x = Math.max(0, box.x0 - pad); x <= Math.min(W - 1, box.x1 + pad); x++) region[y * W + x] = 1;
    }

    const bandOf = (armOff) => {
      const m = new Uint8Array(n);
      let cnt = 0;
      for (let i = 0; i < n; i++) if (im[armOff][i] - im.base[i] >= T) { m[i] = 1; cnt++; }
      return { m, cnt };
    };

    const rows = {};
    for (const [label, armOff] of [['hull', 'nohull'], ['crease', 'noink'], ['ao', 'noao']]) {
      const { m, cnt } = bandOf(armOff);
      const ch = minChord(m, W, H);
      rows[label] = { frame: { ...stats(ch, null), px: cnt }, subj: stats(ch, region),
                      ring: radial(ch, W, H, null) };
    }

    /* The band a viewer actually sees as "the ink": everything the two ink systems together
       took out of the image, measured as one shape. Measuring hull and crease separately
       understates the line, because they overlap along the same silhouette. */
    const inkM = new Uint8Array(n);
    let inkCnt = 0;
    for (let i = 0; i < n; i++) {
      if (im.nohull[i] - im.base[i] >= T || im.noink[i] - im.base[i] >= T) { inkM[i] = 1; inkCnt++; }
    }
    const inkCh = minChord(inkM, W, H);
    let inkSubj = 0;
    for (let i = 0; i < n; i++) if (inkM[i] && region[i]) inkSubj++;
    rows.ink = { frame: { ...stats(inkCh, null), px: inkCnt }, subj: { ...stats(inkCh, region), px: inkSubj },
                 ring: radial(inkCh, W, H, null) };

    /* P3c — is it a line or a fill? A line system's mask is thousands of short components; the
       pre-fix pass produced ONE blob of 155,228 px covering 17 % of `courtyard`. Cut at 15 L rather
       than the 4 L detection floor so the statistic describes the ink a viewer actually sees. */
    const strongOf = (hullOff, inkOff, ref) => {
      const m = new Uint8Array(n);
      let cnt = 0;
      for (let i = 0; i < n; i++) {
        if ((hullOff ? im[hullOff][i] - im[ref][i] >= 15 : false)
          || (inkOff ? im[inkOff][i] - im[ref][i] >= 15 : false)) { m[i] = 1; cnt++; }
      }
      const big = largestBox(m, W, H);
      return { strongPx: cnt, largest: big ? big.n : 0, share: cnt ? +(big.n / cnt).toFixed(3) : 0 };
    };
    rows.blob = strongOf('nohull', 'noink', 'base');

    /* THE BEFORE ARM, same boot. `legacy` restores the pre-fix widths and un-gates the crease pass
       (see POKES.legacy); `legacy_nohull` is that with the ink materials hidden, so the pre-fix hull
       band is `legacy_nohull` minus `legacy` — the number the first baseline run never produced,
       because its hull lever was overwritten every frame. */
    if (im.legacy && im.legacy_nohull) {
      const lm = new Uint8Array(n);
      let lc = 0;
      for (let i = 0; i < n; i++) if (im.legacy_nohull[i] - im.legacy[i] >= T) { lm[i] = 1; lc++; }
      const lch = minChord(lm, W, H);
      let lSubj = 0;
      for (let i = 0; i < n; i++) if (lm[i] && region[i]) lSubj++;
      rows.hullLegacy = { frame: { ...stats(lch, null), px: lc },
                          subj: { ...stats(lch, region), px: lSubj },
                          ring: radial(lch, W, H, null) };

      /* Whole-frame difference between the two renderers, which is what the fix actually changed. */
      let moved = 0, lighter = 0, sum = 0;
      for (let i = 0; i < n; i++) {
        const d = im.base[i] - im.legacy[i];
        if (Math.abs(d) >= T) { moved++; sum += d; if (d > 0) lighter++; }
      }
      rows.legacyDelta = { movedPx: moved, lighterPx: lighter,
                           meanDelta: moved ? +(sum / moved).toFixed(2) : 0 };

      /* THE FILL, MEASURED AS THE THING THAT WAS REMOVED. Pixels the candidate made materially
         lighter than the pre-fix renderer are exactly the ink the planarity gate withdrew. Its
         connected structure is the point: withdrawing a LINE would leave thousands of short
         components, withdrawing a FILL leaves one blob. This needs no extra arm and no
         cross-resolution comparison — both images are the same boot, same clock, same staging. */
      const rm = new Uint8Array(n);
      let rmN = 0;
      for (let i = 0; i < n; i++) if (im.base[i] - im.legacy[i] >= 15) { rm[i] = 1; rmN++; }
      const rmBig = largestBox(rm, W, H);
      const rmCh = minChord(rm, W, H);
      rows.removedFill = {
        px: rmN,
        largest: rmBig ? rmBig.n : 0,
        share: rmN ? +(rmBig.n / rmN).toFixed(3) : 0,
        chord: stats(rmCh, null),
      };
    }

    // FXAA's own contribution to any measured width (only captured in the first baseline run).
    let fxaaDiff = -1;
    if (im.fxaa) {
      fxaaDiff = 0;
      for (let i = 0; i < n; i++) if (Math.abs(im.fxaa[i] - im.base[i]) >= T) fxaaDiff++;
    }

    const rec = {
      shot: r.shot, w: W, h: H,
      subjectBox: box && { x0: box.x0, y0: box.y0, x1: box.x1, y1: box.y1, wpx: box.x1 - box.x0 + 1, hpx: box.y1 - box.y0 + 1, n: box.n },
      charPx: charN,
      nullDiff, nullMax: +nullMax.toFixed(2),
      calibMats: r.calibMats,
      fxaaDiff,
      bands: rows,
    };

    // --- calibration 3: hull2x must widen the hull band
    const h1 = bandOf('nohull');
    const im2 = im.hull2x;
    const m2 = new Uint8Array(n);
    let c2 = 0;
    for (let i = 0; i < n; i++) if (im.nohull[i] - im2[i] >= T) { m2[i] = 1; c2++; }
    const ch2 = minChord(m2, W, H);
    rec.hull2x = { frame: { ...stats(ch2, null), px: c2 }, subj: stats(ch2, region) };
    rec.hullBase = { frame: { ...stats(minChord(h1.m, W, H), null), px: h1.cnt } };

    report.shots.push(rec);

    const f = (s) => s.n ? `med ${String(s.med).padStart(3)} p90 ${String(s.p90).padStart(3)} p99 ${String(s.p99).padStart(4)} max ${String(s.max).padStart(4)} n ${s.n}` : 'EMPTY';
    console.log(`\n--- ${r.shot} (${W}x${H}) ---`);
    console.log(`  CAL null   : ${nullDiff} px differ (max ${nullMax.toFixed(2)} L)   ${nullDiff === 0 ? 'PASS' : 'FAIL — run is VOID'}`);
    console.log(`  CAL nochar : ${charN} px moved   box ${box ? `${box.x0},${box.y0}..${box.x1},${box.y1}  ${box.x1 - box.x0 + 1}x${box.y1 - box.y0 + 1}` : 'none'}   ${charN > 200 ? 'PASS' : 'FAIL — poke path dead'}`);
    console.log(`  CAL hull2x : ${rec.calibMats} materials doubled; band med ${rec.hull2x.frame.med} vs base ${rec.hullBase.frame.med}   ${rec.hull2x.frame.med >= rec.hullBase.frame.med * 1.6 ? 'PASS' : 'FAIL — width estimator blind'}`);
    if (fxaaDiff >= 0) console.log(`  fxaa cost  : ${fxaaDiff} px differ from base`);
    console.log(`  ink blob   : strong(>=15L) ${rows.blob.strongPx} px, largest component ${rows.blob.largest} = ${(rows.blob.share * 100).toFixed(0)}% of the mask`);
    if (r.readback) console.log(`  readback   : resScale ${r.readback.resScale}  legacy hull px ${r.readback.hullPxNow}  legacy crease px ${r.readback.creaseAppliedNow}  planar ${r.readback.planarStrength}`);
    if (rows.legacyDelta) console.log(`  vs legacy  : ${rows.legacyDelta.movedPx} px moved, ${rows.legacyDelta.lighterPx} of them lighter, mean ${rows.legacyDelta.meanDelta} L`);
    if (rows.removedFill) console.log(`  removed    : ${rows.removedFill.px} px lightened >=15L, largest component ${rows.removedFill.largest} = ${(rows.removedFill.share * 100).toFixed(0)}% of it, chord ${f(rows.removedFill.chord)}`);
    if (rows.hullLegacy) {
      console.log(`  hull LEGACY frame: ${f(rows.hullLegacy.frame)}`);
      console.log(`  ${''.padEnd(11)}subj : ${f(rows.hullLegacy.subj)}`);
      const g = rows.hullLegacy.ring;
      console.log(`  ${''.padEnd(11)}ring : inner med ${g.inner.med ?? '-'} p05 ${g.inner.p05 ?? '-'} p95 ${g.inner.p95 ?? '-'} spread ${g.inner.spread ?? '-'}`
        + ` | outer med ${g.outer.med ?? '-'} p05 ${g.outer.p05 ?? '-'} p95 ${g.outer.p95 ?? '-'} spread ${g.outer.spread ?? '-'}`);
    }
    for (const k of ['hull', 'crease', 'ink', 'ao']) {
      const g = rows[k].ring;
      console.log(`  ${k.padEnd(7)} frame: ${f(rows[k].frame)}`);
      console.log(`  ${''.padEnd(7)} subj : ${f(rows[k].subj)}`);
      console.log(`  ${''.padEnd(7)} ring : inner med ${g.inner.med ?? '-'} p05 ${g.inner.p05 ?? '-'} p95 ${g.inner.p95 ?? '-'} spread ${g.inner.spread ?? '-'}`
        + ` | outer med ${g.outer.med ?? '-'} p05 ${g.outer.p05 ?? '-'} p95 ${g.outer.p95 ?? '-'} spread ${g.outer.spread ?? '-'}`);
    }
  }

  writeFileSync(path.join(OUT, 'report.json'), JSON.stringify(report, null, 2));
  console.log(`\nwrote ${path.join(OUT, 'report.json')}`);
}

main().catch((e) => { console.error(e); process.exit(1); });

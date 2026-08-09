#!/usr/bin/env node
/**
 * heroread — the scorer for `PREREG-heroread.md`. Critic 9's D4 (the hero reads as a background
 * element) and D11 (the face is off-model).
 *
 * Two boots, because `?face=` is read at module-load time and cannot be poked in-page:
 *
 *   boot A   `?face=raw`   the supplied head albedo.  Renders `sly-closeup`.
 *   boot B   default       the derived one.           Renders `sly-closeup`, then `hero` and
 *                          `courtyard` twice each with `SHOTS[name].player` poked in-page to
 *                          the OLD staging and then the NEW one.
 *
 * The staging A/B is INSIDE one boot on purpose; the face A/B cannot be, so `C2` tests the two
 * boots against each other on a background ROI and voids the run if they disagree. Cross-boot
 * determinism is not assumed here (§263.3 measured it as large); it is checked.
 *
 * Character pixels are `debugTerm(8)`'s B channel — `vSlySkin`, 1.0 on a SkinnedMesh and 0.0
 * otherwise, so it quantises to 255/0 and no threshold choice can move the population. The cane
 * is a plain `THREE.Mesh` and is out, which matches the ruler baseline in the seal. Guards are
 * skinned, so the figure is the largest 4-connected component.
 *
 *   node tools/heroread.mjs [--out progress/records/heroread]
 */
import { writeFileSync, mkdirSync, rmSync } from 'node:fs';
import path from 'node:path';
import { withGame, ROOT } from './harness.mjs';
import { shipVerdict, verdictLine } from './gate.mjs';
import { readPNG } from './png.mjs';

const OUT = path.resolve(ROOT, (() => {
  const i = process.argv.indexOf('--out');
  return i < 0 ? 'progress/records/heroread' : process.argv[i + 1];
})());
mkdirSync(OUT, { recursive: true });

/* Frozen in PREREG-heroread §3. `sly-closeup`'s camera and staging do not move, so these are
   stable by construction — that is why the ROIs are on that shot and not on `hero`. */
const ROI = {
  NOSE: [582, 165, 622, 205],
  CHEEK: [600, 188, 660, 212],
  HEAD: [588, 118, 710, 216],
  BG: [40, 40, 240, 240],
};
/* The staging arms. OLD is what `Shots.js` carried before this seal; NEW must equal what it
   carries now, and the runner asserts that rather than trusting it. */
const STAGING = {
  hero: { old: { pos: [2.2, 9.0, 8.4], yaw: 5.72 }, nw: { pos: [4.0, 8.99, 13.2], yaw: 5.889 } },
  courtyard: { old: { pos: [-6.6, 5.12, 12.4], yaw: 5.08 }, nw: { pos: [2.4, 0.02, 26.4], yaw: 5.341 } },
};
const R9 = { hero: 113, courtyard: 41 };

/* ---------------------------------------------------------------------------- page helpers -- */
async function install(page) {
  await page.evaluate(() => {
    const W = window;
    W.__CAP = {};
    W.__sh = () => W.__ENGINE.get('shading');
    /* `capture()` calls `engine.renderFrame(0)` itself, so a second arm at the same staging
       costs ONE frame rather than a whole 17-frame `setShot`. The PNG crosses the CDP bridge as
       base64 and is decoded in Node: shipping `getImageData().data` instead is 3.7 M numbers per
       frame through JSON, which is minutes of serialisation for nine frames. */
    W.__grab = (key) => { W.__CAP[key] = W.__GAME.capture('image/png', 1.0, 0); return W.__CAP[key].length; };
    W.__poke = async (shot, pos, yaw) => {
      const m = await import('/src/core/Shots.js');
      m.SHOTS[shot].player.pos = pos.slice();
      m.SHOTS[shot].player.yaw = yaw;
      return JSON.parse(JSON.stringify(m.SHOTS[shot].player));
    };
    W.__read = async (shot) => {
      const m = await import('/src/core/Shots.js');
      return JSON.parse(JSON.stringify(m.SHOTS[shot].player));
    };
  });
}
/** Fetch one capture and decode it in Node. Returns `{w, h, d}` with RGBA bytes. */
async function pull(page, key) {
  const url = await page.evaluate(([k]) => window.__CAP[k], [key]);
  if (!url) throw new Error(`no capture "${key}"`);
  const tmp = path.join(OUT, `.${key}.png`);
  writeFileSync(tmp, Buffer.from(url.slice(url.indexOf(',') + 1), 'base64'));
  const im = readPNG(tmp);
  rmSync(tmp, { force: true });
  if (im.ch === 4) return { w: im.w, h: im.h, d: im.data };
  const d = new Uint8Array(im.w * im.h * 4);
  for (let i = 0; i < im.w * im.h; i++) {
    d[i * 4] = im.data[i * im.ch]; d[i * 4 + 1] = im.data[i * im.ch + 1];
    d[i * 4 + 2] = im.data[i * im.ch + 2]; d[i * 4 + 3] = 255;
  }
  return { w: im.w, h: im.h, d };
}

/* ------------------------------------------------------------------------------- measuring -- */
const L = (d, i) => 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2];

function roiStats(img, box) {
  const [x0, y0, x1, y1] = box;
  let n = 0, r = 0, g = 0, b = 0, sl = 0, dark = 0;
  for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
    const i = (y * img.w + x) * 4;
    n++; r += img.d[i]; g += img.d[i + 1]; b += img.d[i + 2];
    const l = L(img.d, i); sl += l; if (l < 60) dark++;
  }
  return { n, r: r / n, g: g / n, b: b / n, L: sl / n, rb: r / b, dark };
}
function roiDelta(a, b, box) {
  const [x0, y0, x1, y1] = box;
  let n = 0, s = 0;
  for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
    const i = (y * a.w + x) * 4;
    s += (Math.abs(a.d[i] - b.d[i]) + Math.abs(a.d[i + 1] - b.d[i + 1]) + Math.abs(a.d[i + 2] - b.d[i + 2])) / 3;
    n++;
  }
  return s / n;
}

/** Largest 4-connected component of {B channel > 127}: the character, not the garrison. */
function figure(img) {
  const { w, h, d } = img;
  const on = new Uint8Array(w * h);
  let total = 0;
  for (let i = 0, p = 0; p < w * h; p++, i += 4) if (d[i + 2] > 127) { on[p] = 1; total++; }
  const seen = new Uint8Array(w * h);
  const stack = new Int32Array(w * h);
  let best = null;
  for (let p0 = 0; p0 < w * h; p0++) {
    if (!on[p0] || seen[p0]) continue;
    let sp = 0; stack[sp++] = p0; seen[p0] = 1;
    let n = 0, x0 = w, x1 = -1, y0 = h, y1 = -1, sx = 0, sy = 0;
    while (sp) {
      const p = stack[--sp], x = p % w, y = (p / w) | 0;
      n++; sx += x; sy += y;
      if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
      if (x > 0 && on[p - 1] && !seen[p - 1]) { seen[p - 1] = 1; stack[sp++] = p - 1; }
      if (x < w - 1 && on[p + 1] && !seen[p + 1]) { seen[p + 1] = 1; stack[sp++] = p + 1; }
      if (y > 0 && on[p - w] && !seen[p - w]) { seen[p - w] = 1; stack[sp++] = p - w; }
      if (y < h - 1 && on[p + w] && !seen[p + w]) { seen[p + w] = 1; stack[sp++] = p + w; }
    }
    if (!best || n > best.area) best = { area: n, x0, x1, y0, y1, cx: sx / n, cy: sy / n };
  }
  if (!best) return { area: 0, height: 0, skinTotal: total };
  return { ...best, height: best.y1 - best.y0 + 1, width: best.x1 - best.x0 + 1, skinTotal: total };
}

/* ------------------------------------------------------------------------------------- run -- */
const rec = { at: new Date().toISOString(), gates: {}, notes: {} };
/* `guards` values go to `gate.mjs` verbatim: exactly `true` is PASS, exactly `false` is FAIL and
   anything else — here `null` — is VOID. Never collapse a void arm to `false`; §263.4. */
const guards = {};
const gate = (id, pass, note, voidIf = false) => {
  const v = voidIf ? null : !!pass;
  guards[id] = v;
  rec.gates[id] = v === null ? 'VOID' : v ? 'PASS' : 'FAIL';
  rec.notes[id] = note;
  console.log(`  ${rec.gates[id].padEnd(4)}  ${id}  ${note}`);
  return v === true;
};

console.log('BOOT A — ?face=raw');
const A = await withGame({ width: 1280, height: 720, quality: 'high', query: 'face=raw' },
  async ({ page, info }) => {
    await install(page);
    await page.evaluate(() => window.__GAME.setShot('sly-closeup', { dt: 0 }));
    await page.evaluate(() => window.__grab('closeup'));
    return { closeup: await pull(page, 'closeup'), warnings: info.warnings, errors: info.consoleErrors };
  });
console.log(`  boot A warnings: ${A.warnings.length}`);

console.log('BOOT B — default (sly_head_fix)');
const B = await withGame({ width: 1280, height: 720, quality: 'high' }, async ({ page, info }) => {
  await install(page);
  const out = { warnings: info.warnings, errors: info.consoleErrors, staged: {} };

  await page.evaluate(() => window.__GAME.setShot('sly-closeup', { dt: 0 }));
  await page.evaluate(() => window.__grab('closeup'));
  out.closeup = await pull(page, 'closeup');

  for (const shot of ['hero', 'courtyard']) {
    const live = await page.evaluate(([s]) => window.__read(s), [shot]);
    out.staged[shot] = { live };
    for (const arm of ['old', 'nw']) {
      const st = STAGING[shot][arm];
      const got = await page.evaluate(([s, p, y]) => window.__poke(s, p, y), [shot, st.pos, st.yaw]);
      out.staged[shot][arm] = got;
      await page.evaluate(([s]) => window.__GAME.setShot(s, { dt: 0 }), [shot]);
      await page.evaluate(() => window.__sh().debugTerm(8));
      await page.evaluate(([k]) => window.__grab(k), [`${shot}_${arm}_mask`]);
      await page.evaluate(() => window.__sh().debugTerm(0));
      await page.evaluate(([k]) => window.__grab(k), [`${shot}_${arm}_beauty`]);
      out[`${shot}_${arm}_mask`] = await pull(page, `${shot}_${arm}_mask`);
      out[`${shot}_${arm}_beauty`] = await pull(page, `${shot}_${arm}_beauty`);
    }
  }
  return out;
});
console.log(`  boot B warnings: ${B.warnings.length}`);

/* the live table must have carried the NEW staging before anything was poked */
for (const shot of ['hero', 'courtyard']) {
  const live = B.staged[shot].live, want = STAGING[shot].nw;
  const same = live.pos.every((v, i) => Math.abs(v - want.pos[i]) < 1e-9) && Math.abs(live.yaw - want.yaw) < 1e-9;
  console.log(`  ${shot}: shipped staging ${JSON.stringify(live.pos)} yaw ${live.yaw} — ${same ? 'matches the seal' : 'DOES NOT MATCH THE SEAL'}`);
  if (!same) rec.mismatch = true;
}

/* ------------------------------------------------------------------------------ calibration -- */
console.log('\nCALIBRATION');
const c1 = roiDelta(A.closeup, B.closeup, ROI.HEAD);
const c2 = roiDelta(A.closeup, B.closeup, ROI.BG);
const C1 = gate('C1 head differs between arms', c1 >= 4.0, `mean |dRGB| over HEAD = ${c1.toFixed(2)} (bar >= 4.0)`);
const C2 = gate('C2 background does not', c2 <= 1.5, `mean |dRGB| over BG = ${c2.toFixed(2)} (bar <= 1.5)`);
const faceVoid = !(C1 && C2);

/* ------------------------------------------------------------------------------------- D11 -- */
console.log('\nD11 — face');
const nA = roiStats(A.closeup, ROI.NOSE), nB = roiStats(B.closeup, ROI.NOSE);
const kA = roiStats(A.closeup, ROI.CHEEK), kB = roiStats(B.closeup, ROI.CHEEK);
gate('F1 a black nose arrives', nB.dark - nA.dark >= 100,
  `dark(L<60) in NOSE ${nA.dark} -> ${nB.dark}, delta ${nB.dark - nA.dark} (bar >= +100)`, faceVoid);
const f2Void = faceVoid || kA.rb < 1.40;
gate('F2 head fur neutralises', kB.rb <= 0.90 * kA.rb,
  `CHEEK R/B ${kA.rb.toFixed(3)} -> ${kB.rb.toFixed(3)} (bar <= ${(0.90 * kA.rb).toFixed(3)}; premise A >= 1.40)`, f2Void);
gate('F3 value is held', Math.abs(kB.L - kA.L) <= 12,
  `CHEEK L ${kA.L.toFixed(1)} -> ${kB.L.toFixed(1)}, delta ${(kB.L - kA.L).toFixed(1)} (bar |d| <= 12)`, faceVoid);

/* -------------------------------------------------------------------------------------- D4 -- */
console.log('\nD4 — subject size');
const fig = {};
for (const shot of ['hero', 'courtyard']) {
  const fa = figure(B[`${shot}_old_mask`]), fb = figure(B[`${shot}_nw_mask`]);
  fig[shot] = { old: fa, nw: fb };
  console.log(`  ${shot}: old ${fa.height} px h, ${fa.area} px area, bbox y ${fa.y0}..${fa.y1}, cx ${fa.cx.toFixed(0)}`
    + `   (r9 ruler read ${R9[shot]} px)`);
  console.log(`  ${shot}: new ${fb.height} px h, ${fb.area} px area, bbox y ${fb.y0}..${fb.y1}, cx ${fb.cx.toFixed(0)}`
    + `   = ${(fb.height / 720 * 100).toFixed(1)}% of frame`);
}
const h1 = ['hero', 'courtyard'].every((s) => Math.abs(fig[s].nw.height - fig[s].old.height) >= 20
  && Math.abs(fig[s].nw.cx - fig[s].old.cx) >= 30);
const H1 = gate('H1 the staging poke took', h1,
  ['hero', 'courtyard'].map((s) => `${s} dh ${Math.abs(fig[s].nw.height - fig[s].old.height)} dcx ${Math.abs(fig[s].nw.cx - fig[s].old.cx).toFixed(0)}`).join('; '));
const d4Void = !H1 || !!rec.mismatch;
gate('H2 hero >= 25% of frame', fig.hero.nw.height >= 180,
  `${fig.hero.nw.height} px = ${(fig.hero.nw.height / 720 * 100).toFixed(1)}% (bar >= 180 px; predicted 202)`, d4Void);
gate('H3 hero is inside the frame', fig.hero.nw.y0 >= 8 && fig.hero.nw.y1 <= 712,
  `rows ${fig.hero.nw.y0}..${fig.hero.nw.y1} (bars >= 8, <= 712)`, d4Void);
gate('H4 hero area >= 2.2x', fig.hero.nw.area >= 2.2 * fig.hero.old.area,
  `${fig.hero.old.area} -> ${fig.hero.nw.area} = ${(fig.hero.nw.area / fig.hero.old.area).toFixed(2)}x (bar >= 2.2)`, d4Void);
gate('H5 courtyard >= 65 px', fig.courtyard.nw.height >= 65,
  `${fig.courtyard.nw.height} px = ${(fig.courtyard.nw.height / 720 * 100).toFixed(1)}% (bar >= 65 px; predicted 77)`, d4Void);
gate('H6 courtyard area >= 2.2x', fig.courtyard.nw.area >= 2.2 * fig.courtyard.old.area,
  `${fig.courtyard.old.area} -> ${fig.courtyard.nw.area} = ${(fig.courtyard.nw.area / fig.courtyard.old.area).toFixed(2)}x (bar >= 2.2)`, d4Void);

/* ----------------------------------------------------------------------------------- write -- */
rec.rois = ROI;
rec.face = { c1, c2, nose: { A: nA.dark, B: nB.dark }, cheek: { A: { rb: kA.rb, L: kA.L }, B: { rb: kB.rb, L: kB.L } } };
rec.figure = fig;
rec.staged = B.staged;
rec.warnings = { A: A.warnings, B: B.warnings };
writeFileSync(path.join(OUT, 'heroread.json'), JSON.stringify(rec, null, 2));

/* PNGs for the record. `crop.mjs`'s writer is RGB, so drop alpha. */
const { writePNG } = await import('./crop.mjs');
const save = (img, name) => {
  const rgb = Buffer.alloc(img.w * img.h * 3);
  for (let i = 0; i < img.w * img.h; i++) { rgb[i * 3] = img.d[i * 4]; rgb[i * 3 + 1] = img.d[i * 4 + 1]; rgb[i * 3 + 2] = img.d[i * 4 + 2]; }
  writePNG(path.join(OUT, name), img.w, img.h, rgb);
};
save(A.closeup, 'closeup-faceraw.png');
save(B.closeup, 'closeup-facefix.png');
for (const shot of ['hero', 'courtyard']) for (const arm of ['old', 'nw']) save(B[`${shot}_${arm}_beauty`], `${shot}-${arm}.png`);

console.log('');
console.log(verdictLine(shipVerdict(guards)));
console.log(`wrote ${path.relative(ROOT, OUT)}/`);

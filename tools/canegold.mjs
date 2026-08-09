#!/usr/bin/env node
/* canegold — does art-directing the protagonist's materials actually do anything?
 *
 * Scores PREREG-charmat.md §4. ONE boot, every arm a live poke of `mat.userData.slyUniforms`
 * (+ `mat.roughness`, which three pushes as `roughnessFactor` -> the shader's `rgh`), so no
 * recompile can reorder draws between arms. `setShot(..., { dt: 0 })` on every arm (§251).
 *
 * The cane's screen footprint is obtained by DIFFERENCING (render with `cane.visible` true and
 * false) rather than by projecting a bounding box, so the mask is exactly the pixels the cane
 * paints — and the arm that produces it is also the positive control that MUST fire (§255: a
 * null arm proves repeatability, not sensitivity).
 *
 * usage: node tools/canegold.mjs
 */
import { withGame } from './harness.mjs';
import { shipVerdict, verdictLine } from './gate.mjs';

const SHOTS = ['sly-closeup', 'hero'];

/* PREREG-charmat §2 — every number here is quoted from an existing shipped site. */
const GOLD85 = { spec: 0.9, gloss: 96, metal: 0.85, rough: 0.28, sss: 0.0 };  // Props.js MATERIALS.gold
const GOLD100 = { ...GOLD85, metal: 1.0 };                                    // SlyModel.js `gold`
/* PREREG-charmat §4.2 — Props gold's `rough: 0.28` is DEAD (it passes a roughnessMap, and
   ToonMaterial sets `roughness: o.roughnessMap ? 1.0 : o.rough`), so the value that gold
   actually runs at is the map's median 0.638. This arm reproduces the effective gold. */
const GOLD85R64 = { ...GOLD85, rough: 0.638 };
const SPLIT = {                                                               // SlyModel.js _matSpec
  'slydlrig:head': { spec: 0.025, gloss: 8 },
  'slydlrig:tail': { spec: 0.03, gloss: 9, sss: 0.228 },
  'slydlrig:body': { spec: 0.085, gloss: 20, sss: 0.14 },
};
const TOUCHED = ['slydlrig:cane', 'slydlrig:head', 'slydlrig:tail', 'slydlrig:body'];

/* NOT a table of what the base values "should" be.
 *
 * The first draft of this file hard-coded the restore values, and got the cane's `sss` wrong:
 * the body parts pass `sss: T.furSSS` (0.38) but the cane passes no `sss` at all, so it
 * inherits `TUNE.sss` = 0.20. I4 ("restore must re-equal base") would have FAILED on a defect
 * in the instrument rather than in the candidate, and voided the run. The base state is now
 * READ OFF THE LIVE MATERIALS before anything is poked, so it cannot disagree with the build. */

const out = await withGame({ width: 1280, height: 720, quality: 'high' }, async ({ page }) => {
  /* ---- install the in-page rig -------------------------------------------------- */
  await page.evaluate(() => {
    const W = window;
    W.__CAP = {};
    W.__mats = (name) => {
      const out = [];
      W.__ENGINE.scene.traverse((o) => {
        const ms = Array.isArray(o.material) ? o.material : (o.material ? [o.material] : []);
        for (const m of ms) if (m && m.name === name) out.push(m);
      });
      return out;
    };
    W.__caneMesh = () => { let f = null; W.__ENGINE.scene.traverse((o) => { if (o.name === 'cane') f = o; }); return f; };
    /* Poke, then READ BACK. A poke that silently no-ops is the failure mode this whole
       measurement is worthless under, so the readback is returned and asserted by the caller. */
    W.__poke = (name, v) => {
      const ms = W.__mats(name);
      for (const m of ms) {
        const u = m.userData?.slyUniforms;
        if (!u) continue;
        if (v.spec != null) u.uSpec.value = v.spec;
        if (v.gloss != null) u.uGloss.value = v.gloss;
        if (v.metal != null) u.uMetal.value = v.metal;
        if (v.sss != null) u.uSss.value = v.sss;
        if (v.rough != null) m.roughness = v.rough;
      }
      return ms.map((m) => ({
        spec: m.userData?.slyUniforms?.uSpec?.value, gloss: m.userData?.slyUniforms?.uGloss?.value,
        metal: m.userData?.slyUniforms?.uMetal?.value, sss: m.userData?.slyUniforms?.uSss?.value,
        rough: m.roughness,
      }));
    };
    /* Snapshot the live shading state of a material, for an exact restore. */
    W.__readMat = (name) => W.__mats(name).map((m) => ({
      spec: m.userData?.slyUniforms?.uSpec?.value, gloss: m.userData?.slyUniforms?.uGloss?.value,
      metal: m.userData?.slyUniforms?.uMetal?.value, sss: m.userData?.slyUniforms?.uSss?.value,
      rim: m.userData?.slyUniforms?.uRim?.value, rough: m.roughness,
    }));
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
    /* pixels differing at all, and the index list (used once, for the mask) */
    W.__diff = (a, b, wantIdx) => {
      const A = W.__CAP[a], B = W.__CAP[b];
      let n = 0; const idx = [];
      for (let i = 0; i < A.d.length; i += 4) {
        if (A.d[i] !== B.d[i] || A.d[i + 1] !== B.d[i + 1] || A.d[i + 2] !== B.d[i + 2]) { n++; if (wantIdx) idx.push(i); }
      }
      return wantIdx ? { n, idx } : { n };
    };
    W.__stats = (key, idx) => {
      const A = W.__CAP[key], v = new Float64Array(idx.length);
      let s = 0;
      for (let k = 0; k < idx.length; k++) { const L = W.__L(A.d, idx[k]); v[k] = L; s += L; }
      v.sort();
      const q = (p) => (v.length ? v[Math.min(v.length - 1, Math.max(0, Math.round(p * (v.length - 1))))] : null);
      return { n: v.length, mean: v.length ? s / v.length : null, p50: q(0.5), p90: q(0.9), p99: q(0.99), max: q(1) };
    };
    /* The mask's bounding box, dilated by `pad` px — PREREG-charmat §4.1's G4'. */
    W.__maskBox = (idx, w, h, pad) => {
      let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
      for (const i of idx) { const p = i / 4, x = p % w, y = (p / w) | 0;
        if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
      return { x0: Math.max(0, x0 - pad), y0: Math.max(0, y0 - pad),
        x1: Math.min(w - 1, x1 + pad), y1: Math.min(h - 1, y1 + pad) };
    };
    /* diff restricted to the complement of `idx` — G4/G4'/G5's "nothing else moved".
       `far` counts differing pixels OUTSIDE the dilated box (G4', gated);
       `n` counts all differing pixels outside the mask (G4 as first registered, reported). */
    W.__diffOutside = (a, b, idx, box) => {
      const A = W.__CAP[a], B = W.__CAP[b], w = A.w;
      const inMask = new Uint8Array(A.d.length / 4);
      for (const i of idx) inMask[i / 4] = 1;
      let n = 0, far = 0, halo = 0; const vals = [];
      for (let i = 0; i < A.d.length; i += 4) {
        if (inMask[i / 4]) continue;
        const p = i / 4, x = p % w, y = (p / w) | 0;
        const differs = A.d[i] !== B.d[i] || A.d[i + 1] !== B.d[i + 1] || A.d[i + 2] !== B.d[i + 2];
        if (differs) {
          n++;
          if (box && (x < box.x0 || x > box.x1 || y < box.y0 || y > box.y1)) far++; else halo++;
        }
        vals.push(W.__L(B.d, i));
      }
      vals.sort((x, y) => x - y);
      const q = (p) => (vals.length ? vals[Math.round(p * (vals.length - 1))] : null);
      return { n, far, halo, p99: q(0.99) };
    };
  });

  /* Read the shipped state of every material this run will touch, ONCE, before any poke.
     Everything restores to this, so a wrong assumption in a table cannot void I4/I2. */
  const BASE_STATE = await page.evaluate(([names]) => {
    const out = {};
    for (const n of names) out[n] = window.__readMat(n)[0] || null;
    return out;
  }, [TOUCHED]);
  console.log('shipped material state, read from the live build (this is what "base" means):');
  for (const [k, v] of Object.entries(BASE_STATE)) console.log(`  ${k.padEnd(18)} ${JSON.stringify(v)}`);
  for (const [k, v] of Object.entries(BASE_STATE)) {
    if (!v) throw new Error(`${k} not present in the scene — the whole run would be VOID`);
  }

  const R = {};
  for (const shot of SHOTS) {
    console.log(`\n${'='.repeat(78)}\n### ${shot}`);
    const rec = {};

    /* --- I1 base ------------------------------------------------------------- */
    await page.evaluate(([s]) => window.__snap('base', s), [shot]);

    /* --- I2 base2: nothing poked. MUST be 0 px. ------------------------------ */
    await page.evaluate(([s]) => window.__snap('base2', s), [shot]);
    rec.I2 = (await page.evaluate(() => window.__diff('base', 'base2'))).n;

    /* --- I3 hide: defines the mask AND is the control that must fire --------- */
    const vis = await page.evaluate(([s]) => {
      const c = window.__caneMesh();
      if (!c) return { err: 'no mesh named "cane"' };
      c.visible = false;
      return window.__snap('hide', s).then(() => ({ ok: true }));
    }, [shot]);
    if (vis.err) throw new Error(vis.err);
    const mask = await page.evaluate(() => {
      const d = window.__diff('base', 'hide', true);
      window.__MASK = d.idx;
      const A = window.__CAP.base;
      window.__BOX = d.idx.length ? window.__maskBox(d.idx, A.w, A.h, 16) : null;
      return { n: d.n, box: window.__BOX };
    });
    await page.evaluate(([s]) => { window.__caneMesh().visible = true; return window.__snap('reshow', s); }, [shot]);
    rec.I3 = mask.n;
    rec.reshow = (await page.evaluate(() => window.__diff('base', 'reshow'))).n;

    rec.baseStats = await page.evaluate(() => window.__stats('base', window.__MASK));

    /* --- C1 gold85 / C2 gold100 --------------------------------------------- */
    for (const [arm, v] of [['gold85', GOLD85], ['gold100', GOLD100], ['gold85r64', GOLD85R64]]) {
      const back = await page.evaluate(([n, val]) => window.__poke(n, val), ['slydlrig:cane', v]);
      await page.evaluate(([s, a]) => window.__snap(a, s), [shot, arm]);
      rec[arm] = {
        readback: back,
        stats: await page.evaluate(([a]) => window.__stats(a, window.__MASK), [arm]),
        outside: await page.evaluate(([a]) => window.__diffOutside('base', a, window.__MASK, window.__BOX), [arm]),
      };
    }

    /* --- I4 restore: MUST re-equal base -------------------------------------- */
    await page.evaluate(([v]) => window.__poke('slydlrig:cane', v), [BASE_STATE['slydlrig:cane']]);
    await page.evaluate(([s]) => window.__snap('restore', s), [shot]);
    rec.I4 = (await page.evaluate(() => window.__diff('base', 'restore'))).n;

    /* --- C3 split: body materials + cane at the chosen gold ------------------ */
    await page.evaluate(([sp, g]) => {
      for (const [k, v] of Object.entries(sp)) window.__poke(k, v);
      window.__poke('slydlrig:cane', g);
    }, [SPLIT, GOLD85]);
    /* I5: the eye must be untouched, read back from the live uniforms */
    rec.I5 = await page.evaluate(() => window.__mats('slydlrig:eyeball').map((m) => ({
      spec: m.userData.slyUniforms.uSpec.value, gloss: m.userData.slyUniforms.uGloss.value,
      metal: m.userData.slyUniforms.uMetal.value, sss: m.userData.slyUniforms.uSss.value,
      rim: m.userData.slyUniforms.uRim.value,
    })));
    await page.evaluate(([s]) => window.__snap('split', s), [shot]);
    rec.split = {
      stats: await page.evaluate(() => window.__stats('split', window.__MASK)),
      outside: await page.evaluate(() => window.__diffOutside('base', 'split', window.__MASK, window.__BOX)),
      outsideBase: await page.evaluate(() => window.__diffOutside('base', 'base', window.__MASK, window.__BOX)),
    };

    /* --- reset everything for the next shot ---------------------------------- */
    await page.evaluate(([b]) => { for (const [k, v] of Object.entries(b)) window.__poke(k, v); }, [BASE_STATE]);

    R[shot] = rec;

    /* ---- report ------------------------------------------------------------- */
    const f = (x) => (x == null ? '  —  ' : x.toFixed(1).padStart(6));
    console.log(`  mask |M| = ${rec.I3} px  box ${JSON.stringify(mask.box)}   (I2 null ${rec.I2} px, I4 restore ${rec.I4} px, reshow ${rec.reshow} px)`);
    console.log(`  cane readback @gold85: ${JSON.stringify(rec.gold85.readback)}`);
    console.log(`  ${'arm'.padEnd(10)}${'mean'.padStart(7)}${'p50'.padStart(7)}${'p90'.padStart(7)}${'p99'.padStart(7)}${'max'.padStart(7)}   outside-diff px`);
    const row = (nm, st, o) => console.log(`  ${nm.padEnd(10)}${f(st.mean)}${f(st.p50)}${f(st.p90)}${f(st.p99)}${f(st.max)}   ${o ?? '-'}`);
    row('base', rec.baseStats, '0 / 0');
    for (const a of ['gold85', 'gold100', 'gold85r64']) row(a, rec[a].stats, `${rec[a].outside.n} out (halo ${rec[a].outside.halo}, FAR ${rec[a].outside.far})`);
    row('split', rec.split.stats, `${rec.split.outside.n} out (halo ${rec.split.outside.halo}, FAR ${rec.split.outside.far})`);
    const d = (a, b) => a - b;
    for (const arm of ['gold85', 'gold100', 'gold85r64', 'split']) {
      const s = arm === 'split' ? rec.split.stats : rec[arm].stats;
      console.log(`    Δ${arm.padEnd(9)} mean ${d(s.mean, rec.baseStats.mean).toFixed(1).padStart(7)}`
        + `  p50 ${d(s.p50, rec.baseStats.p50).toFixed(1).padStart(7)}`
        + `  p99 ${d(s.p99, rec.baseStats.p99).toFixed(1).padStart(7)}`
        + `  (p99-p50) ${(d(s.p99, rec.baseStats.p99) - d(s.p50, rec.baseStats.p50)).toFixed(1).padStart(7)}`);
    }
  }
  return R;
});

/* ================= score PREREG-charmat §4 with the tri-state gate ================= */
console.log(`\n${'='.repeat(78)}\n### PREREG-charmat §4 — scored\n`);
const closeup = out['sly-closeup'], hero = out['hero'];
const num = (x) => (typeof x === 'number' && Number.isFinite(x) ? x : null);
const ARM = process.env.CHARMAT_ARM || 'gold85r64';   // §4.2 ship preference: C4 -> C1 -> C2
const d99 = (r, a = ARM) => (num(r[a].stats.p99) != null && num(r.baseStats.p99) != null ? r[a].stats.p99 - r.baseStats.p99 : null);
const d50 = (r, arm = ARM) => {
  const s = arm === 'split' ? r.split.stats : r[arm].stats;
  return num(s.p50) != null && num(r.baseStats.p50) != null ? s.p50 - r.baseStats.p50 : null;
};

const eyeBase = { spec: 0.25, gloss: 32, metal: 0, sss: 0.38, rim: 0.62 };
const eyeOK = (r) => (Array.isArray(r.I5) && r.I5.length > 0
  ? r.I5.every((e) => Math.abs(e.spec - eyeBase.spec) < 1e-9 && Math.abs(e.gloss - eyeBase.gloss) < 1e-9
    && Math.abs(e.metal - eyeBase.metal) < 1e-9 && Math.abs(e.sss - eyeBase.sss) < 1e-9)
  : null);

const guards = {
  I2_null_closeup: closeup.I2 === 0,
  I2_null_hero: hero.I2 === 0,
  I3_control_closeup: closeup.I3 > 200,
  I3_control_hero: hero.I3 > 0,
  I4_restore_closeup: closeup.I4 === 0,
  I4_restore_hero: hero.I4 === 0,
  I5_eye_untouched: eyeOK(closeup) === true && eyeOK(hero) === true,
  G1_p99_rise: num(d99(closeup)) == null ? null : d99(closeup) >= 10,
  G2_concentrated: (num(d99(closeup)) == null || num(d50(closeup)) == null)
    ? null : (d99(closeup) - d50(closeup)) >= 6,
  G3_p50_closeup: num(d50(closeup)) == null ? null : d50(closeup) >= -25,
  G3_p50_hero: num(d50(hero)) == null ? null : d50(hero) >= -25,
  G4prime_far_closeup: closeup[ARM].outside.far === 0,
  G4prime_far_hero: hero[ARM].outside.far === 0,
};
const splitGuards = {
  G5_split_no_washout_closeup: num(closeup.split.outside.p99) == null || num(closeup.split.outsideBase.p99) == null
    ? null : (closeup.split.outside.p99 - closeup.split.outsideBase.p99) <= 1,
  G5_split_no_washout_hero: num(hero.split.outside.p99) == null || num(hero.split.outsideBase.p99) == null
    ? null : (hero.split.outside.p99 - hero.split.outsideBase.p99) <= 1,
};

const vCane = shipVerdict(guards);
for (const [k, s] of Object.entries(vCane.states)) console.log(`  ${k.padEnd(24)} ${s}`);
console.log(`\nCANE arm=${ARM}  ${verdictLine(vCane, `slydlrig:cane -> ${JSON.stringify(ARM === 'gold85r64' ? GOLD85R64 : ARM === 'gold100' ? GOLD100 : GOLD85)}`)}`);
/* every arm scored against the same registered bars, so the fork is visible not asserted */
console.log('\nper-arm, sly-closeup:  G1 dp99>=10   G2 (dp99-dp50)>=6   G3 dp50>=-25   G4prime far==0');
for (const a of ['gold85', 'gold100', 'gold85r64']) {
  const q9 = d99(closeup, a), q5 = d50(closeup, a);
  console.log(`  ${a.padEnd(10)} dp99 ${q9?.toFixed(1).padStart(7)}  dp50 ${q5?.toFixed(1).padStart(7)}`
    + `  conc ${(q9 - q5).toFixed(1).padStart(7)}  far ${String(closeup[a].outside.far).padStart(6)}`
    + `  halo ${String(closeup[a].outside.halo).padStart(6)}  G4(orig) ${String(closeup[a].outside.n).padStart(6)}`);
}

const vSplit = shipVerdict({ ...guards, ...splitGuards });
for (const [k, s] of Object.entries(splitGuards).map(([k]) => [k, vSplit.states[k]])) console.log(`  ${k.padEnd(30)} ${s}`);
console.log(`SPLIT ${verdictLine(vSplit, 'head/tail/body -> SlyModel.js _matSpec fur/cloth rows')}`);

/* metal fork, reported not gated — §2.1 */
console.log(`\nmetal fork (sly-closeup dp50):  0.85 -> ${d50(closeup, 'gold85')?.toFixed(1)}   1.00 -> ${d50(closeup, 'gold100')?.toFixed(1)}   0.85@rough.638 -> ${d50(closeup, 'gold85r64')?.toFixed(1)}`);
console.log(JSON.stringify(out, null, 1).slice(0, 40) + ' …(full record in stdout above)');

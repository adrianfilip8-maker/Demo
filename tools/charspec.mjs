#!/usr/bin/env node
/* charspec — what art-directing the protagonist COSTS and BUYS against PREREG-specnorm2's
 * blocked interval.
 *
 * SPECNORM measured that a physically-correct specular normalisation needs `uSpecNormPow` p
 * ≈ 0.90 for the world (H1), while Sly's lobe-saturated pixels rise +25.2 L at that exponent
 * against a registered bar of ≤ 20 L (G4'). No overlap; the gap is p ∈ (0.70, 0.90].
 *
 * That +25.2 is the cost of his mesh sitting at TUNE defaults — `uSpec` 0.25, `gloss` 32. The
 * rise is driven by `specNorm = ((glossP + 8)/8)^p` scaling the spec term, and BOTH factors
 * fall under PREREG-charmat's split:
 *
 *     glossP = max( uGloss * (1 - 0.6*rgh), 4 )        toon.glsl.js:680
 *     specNorm = pow( (glossP + 8) * 0.125, p )        toon.glsl.js:718
 *
 * so this asks the only question that matters: does giving him fur and cloth put G4' under its
 * own bar at the exponent the world needs?
 *
 * POPULATION, per the correction handed to me: `vSlySkin` (debugTerm 8, B channel), NOT
 * debugTerm(4)'s exact triple, which contains ZERO character pixels. vSlySkin is 0 or 1 so it
 * quantises to 0/255 and an additive offset cannot push it across 0.5.
 *
 * The cane is deliberately OUT of this population by construction: `vSlySkin` is 1.0 on a
 * SkinnedMesh and the cane is a plain THREE.Mesh (toon.glsl.js:228). So the gold cane cannot
 * flatter this number and the split cannot hide behind it.
 *
 * usage: node tools/charspec.mjs
 */
import { withGame } from './harness.mjs';
import { shipVerdict, verdictLine } from './gate.mjs';

/* ONE shot. `temple` was dropped as incidence-bound (§262, 0.65 % of its toon population in
   full sun); `hero` and `courtyard` are dropped for budget after §266 run 2 cost 45 min of
   software rendering. `sly-closeup` carries the most character area, which is the population
   G4prime is defined over. Narrowed before the tool was ever run. */
const SHOTS = ['sly-closeup'];
const P = 0.90;                       // the exponent the world needs (H1 passes 3/4 here)
const BAR = 20;                       // SPECNORM's registered G4' bar, in display L
const SPECNORM_BASE = 25.2;           // what they measured at base materials, p 0.90

const SPLIT = {                       // PREREG-charmat §2, from SlyModel.js:_matSpec
  'slydlrig:head': { spec: 0.025, gloss: 8 },
  'slydlrig:tail': { spec: 0.03, gloss: 9, sss: 0.228 },
  'slydlrig:body': { spec: 0.085, gloss: 20, sss: 0.14 },
};
const PARTS = Object.keys(SPLIT);

/* §266 SHIPPED the split, so the live material state is now the SPLIT, not the base. Reading
   base off the build -- correct while the tree was unsplit -- would now make both arms
   identical and the comparison vacuous. The pre-split values are therefore stated explicitly,
   and the live readback is asserted to equal SPLIT, which doubles as proof that the source
   change reached the build. */
const PRESPLIT = {
  'slydlrig:head': { spec: 0.25, gloss: 32, sss: 0.38 },
  'slydlrig:tail': { spec: 0.25, gloss: 32, sss: 0.38 },
  'slydlrig:body': { spec: 0.25, gloss: 32, sss: 0.38 },
};

const out = await withGame({ width: 1280, height: 720, quality: 'high' }, async ({ page }) => {
  await page.evaluate(() => {
    const W = window;
    W.__CAP = {};
    W.__sh = () => W.__ENGINE.get('shading');
    W.__mats = (name) => { const o = []; W.__ENGINE.scene.traverse((n) => {
      const ms = Array.isArray(n.material) ? n.material : (n.material ? [n.material] : []);
      for (const m of ms) if (m && m.name === name) o.push(m); }); return o; };
    W.__poke = (name, v) => { for (const m of W.__mats(name)) {
      const u = m.userData?.slyUniforms; if (!u) continue;
      if (v.spec != null) u.uSpec.value = v.spec;
      if (v.gloss != null) u.uGloss.value = v.gloss;
      if (v.sss != null) u.uSss.value = v.sss;
    } return W.__mats(name).map((m) => ({ spec: m.userData.slyUniforms.uSpec.value, gloss: m.userData.slyUniforms.uGloss.value })); };
    W.__read = (name) => W.__mats(name).map((m) => ({
      spec: m.userData.slyUniforms.uSpec.value, gloss: m.userData.slyUniforms.uGloss.value,
      sss: m.userData.slyUniforms.uSss.value }))[0];
    W.__snap = async (key, shot) => {
      await W.__GAME.setShot(shot, { dt: 0 });
      const url = W.__GAME.capture('image/png', 1.0, 0);
      const img = new Image(); img.src = url; await img.decode();
      const c = document.createElement('canvas'); c.width = img.width; c.height = img.height;
      const g = c.getContext('2d', { willReadFrequently: true });
      g.drawImage(img, 0, 0);
      W.__CAP[key] = { w: img.width, h: img.height, d: g.getImageData(0, 0, img.width, img.height).data };
      return { w: img.width, h: img.height };
    };
    W.__L = (d, i) => 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2];
    /* mask = vSlySkin (d8.B) AND lobe-saturated (d6.R at its ceiling) */
    W.__mask = (d8k, d6k, satMin) => {
      const A = W.__CAP[d8k], B = W.__CAP[d6k], idx = [];
      let nSkin = 0, nSat = 0;
      for (let i = 0; i < A.d.length; i += 4) {
        const skin = A.d[i + 2] > 127;            // B channel = vSlySkin
        if (skin) nSkin++;
        const sat = B.d[i] >= satMin;             // R channel = specStep / 1.35
        if (sat) nSat++;
        if (skin && sat) idx.push(i);
      }
      return { idx, nSkin, nSat, n: idx.length };
    };
    W.__rise = (a, b, idx) => {                   // L(b) - L(a) over idx
      const A = W.__CAP[a], B = W.__CAP[b];
      const v = new Float64Array(idx.length); let s = 0;
      for (let k = 0; k < idx.length; k++) { const r = W.__L(B.d, idx[k]) - W.__L(A.d, idx[k]); v[k] = r; s += r; }
      v.sort();
      const q = (p) => (v.length ? v[Math.min(v.length - 1, Math.round(p * (v.length - 1)))] : null);
      return { n: v.length, mean: v.length ? s / v.length : null, p50: q(0.5), p90: q(0.9), p99: q(0.99), max: q(1) };
    };
    W.__diff = (a, b) => { const A = W.__CAP[a], B = W.__CAP[b]; let n = 0;
      for (let i = 0; i < A.d.length; i += 4) if (A.d[i] !== B.d[i] || A.d[i + 1] !== B.d[i + 1] || A.d[i + 2] !== B.d[i + 2]) n++;
      return n; };
  });

  const LIVE = await page.evaluate(([ps]) => Object.fromEntries(ps.map((p) => [p, window.__read(p)])), [PARTS]);
  console.log('live body materials, read off the build:');
  for (const [k, v] of Object.entries(LIVE)) console.log(`  ${k.padEnd(18)} ${JSON.stringify(v)}`);
  const shipsSplit = PARTS.every((p) => Math.abs(LIVE[p].spec - SPLIT[p].spec) < 1e-9
    && Math.abs(LIVE[p].gloss - SPLIT[p].gloss) < 1e-9);
  console.log(`live state == §266 SPLIT ? ${shipsSplit}   (if false the source change did not reach the build)`);
  if (!shipsSplit) throw new Error('live materials are not the shipped split — every arm below would be mislabelled');
  const BASE_STATE = PRESPLIT;

  const R = {};
  for (const shot of SHOTS) {
    console.log(`\n${'='.repeat(78)}\n### ${shot}`);
    const rec = {};
    for (const set of ['base', 'split']) {
      if (set === 'split') await page.evaluate(([s]) => { for (const [k, v] of Object.entries(s)) window.__poke(k, v); }, [SPLIT]);
      else await page.evaluate(([b]) => { for (const [k, v] of Object.entries(b)) window.__poke(k, v); }, [BASE_STATE]);

      /* masks, taken at p = 0 with the materials of this set */
      await page.evaluate(() => { window.__sh().uniforms.uSpecNormPow.value = 0; window.__sh().debugTerm(8); });
      await page.evaluate(([s, k]) => window.__snap(k, s), [shot, `${set}_d8`]);
      await page.evaluate(() => window.__sh().debugTerm(6));
      await page.evaluate(([s, k]) => window.__snap(k, s), [shot, `${set}_d6`]);
      await page.evaluate(() => window.__sh().debugTerm(0));

      /* the two renders the rise is computed from */
      await page.evaluate(([p]) => { window.__sh().uniforms.uSpecNormPow.value = 0; }, [0]);
      await page.evaluate(([s, k]) => window.__snap(k, s), [shot, `${set}_n0`]);
      await page.evaluate(([p]) => { window.__sh().uniforms.uSpecNormPow.value = p; }, [P]);
      await page.evaluate(([s, k]) => window.__snap(k, s), [shot, `${set}_n9`]);
      await page.evaluate(() => { window.__sh().uniforms.uSpecNormPow.value = 0; });
      await page.evaluate(([s, k]) => window.__snap(k, s), [shot, `${set}_n0b`]);

      const m = await page.evaluate(([a, b, sm]) => { const r = window.__mask(a, b, sm);
        window.__M = r.idx; return { n: r.n, nSkin: r.nSkin, nSat: r.nSat }; }, [`${set}_d8`, `${set}_d6`, 250]);
      rec[set] = {
        mask: m,
        rise: await page.evaluate(([a, b]) => window.__rise(a, b, window.__M), [`${set}_n0`, `${set}_n9`]),
        restore: await page.evaluate(([a, b]) => window.__diff(a, b), [`${set}_n0`, `${set}_n0b`]),
      };
      const r = rec[set].rise;
      console.log(`  ${set.padEnd(6)} vSlySkin ${String(m.nSkin).padStart(7)} px, lobe-sat ${String(m.nSat).padStart(7)} px, BOTH ${String(m.n).padStart(6)} px`
        + `   restore ${rec[set].restore} px`);
      console.log(`         rise at p=${P}:  mean ${r.mean?.toFixed(1)}  p50 ${r.p50?.toFixed(1)}  p90 ${r.p90?.toFixed(1)}  p99 ${r.p99?.toFixed(1)}  max ${r.max?.toFixed(1)}`);
    }
    await page.evaluate(([b]) => { for (const [k, v] of Object.entries(b)) window.__poke(k, v); }, [BASE_STATE]);
    R[shot] = rec;
  }
  return R;
});

/* ================= score ================= */
console.log(`\n${'='.repeat(78)}\n### what art-direction costs and buys — scored\n`);
const num = (x) => (typeof x === 'number' && Number.isFinite(x) ? x : null);
/* Which statistic did SPECNORM report as "+25.2"? Identify it by reproduction rather than
   assumption: whichever of mean/p50/p90 on BASE lands nearest 25.2 is the one compared. */
let best = null;
for (const shot of SHOTS) {
  for (const stat of ['mean', 'p50', 'p90', 'p99']) {
    const v = num(out[shot].base.rise[stat]);
    if (v == null) continue;
    const err = Math.abs(v - SPECNORM_BASE);
    if (!best || err < best.err) best = { shot, stat, v, err };
  }
}
console.log(`closest reproduction of SPECNORM's +${SPECNORM_BASE} L at base materials:`);
console.log(`  ${best ? `${best.shot} ${best.stat} = ${best.v.toFixed(1)} L  (err ${best.err.toFixed(1)})` : 'NONE — instrument does not match theirs'}`);

console.log(`\nper shot, statistic "${best?.stat}" (the one that reproduces), rise at p=${P}:`);
console.log(`  ${'shot'.padEnd(14)}${'base'.padStart(9)}${'split'.padStart(9)}${'change'.padStart(9)}   base n / split n`);
for (const shot of SHOTS) {
  const b = num(out[shot].base.rise[best?.stat]), s = num(out[shot].split.rise[best?.stat]);
  console.log(`  ${shot.padEnd(14)}${(b?.toFixed(1) ?? '—').padStart(9)}${(s?.toFixed(1) ?? '—').padStart(9)}`
    + `${(b != null && s != null ? (s - b).toFixed(1) : '—').padStart(9)}   ${out[shot].base.mask.n} / ${out[shot].split.mask.n}`);
}

const worstSplit = Math.max(...SHOTS.map((s) => num(out[s].split.rise[best?.stat]) ?? -Infinity));
const worstBase = Math.max(...SHOTS.map((s) => num(out[s].base.rise[best?.stat]) ?? -Infinity));
const guards = {
  S0_instrument_reproduces: best != null && best.err <= 4,
  S1_masks_nonempty: SHOTS.every((s) => out[s].base.mask.n > 0 && out[s].split.mask.n > 0),
  S2_normpow_restores: SHOTS.every((s) => out[s].base.restore === 0 && out[s].split.restore === 0),
  S3_split_reduces: Number.isFinite(worstSplit) && Number.isFinite(worstBase) ? worstSplit < worstBase : null,
  S4_split_under_bar: Number.isFinite(worstSplit) ? worstSplit <= BAR : null,
};
const v = shipVerdict(guards);
for (const [k, s] of Object.entries(v.states)) console.log(`  ${k.padEnd(26)} ${s}`);
console.log(`\nworst-shot rise at p=${P}:  base ${worstBase.toFixed(1)} L   split ${worstSplit.toFixed(1)} L   (bar ${BAR} L)`);
console.log(verdictLine(v, `art-direction puts G4' under its bar at p=${P} — the interval may be closable by materials`));

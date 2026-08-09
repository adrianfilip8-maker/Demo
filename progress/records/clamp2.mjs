/**
 * clamp2.mjs — measure (not model) the cap's release point and its re-bind threshold under a
 * key boost, and re-score the transcription with the input clamp1 omitted.
 *
 * Criteria C5-C8 registered in PREREG-clamp1.md (addendum) BEFORE this ran.
 * Uniform readback only: no render, no framebuffer, no drift floor. One boot.
 */
import { withGame } from '../../tools/harness.mjs';
import { writeFileSync } from 'node:fs';

const PEAKS = [0.30, 0.50, 0.54, 0.56, 0.5620, 0.58, 0.60, 0.62, 0.70, 4.00];
const KEYF = [1.00, 1.05, 1.10, 1.15, 1.40, 1.70, 2.10, 2.60];
const SHOTS = ['hero', 'temple', 'courtyard', 'combat', 'dunes', 'traversal', 'interior', 'night'];
const lum = (c) => 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];

const out = await withGame({ width: 640, height: 360, timeout: 300000 }, async ({ page }) => {
  const res = { inputs: [], peakSweep: null, keySweep: null };

  // C7 — per-shot inputs INCLUDING uBounceColor / uSkyColor this time.
  for (const shot of SHOTS) {
    const r = await page.evaluate(async (name) => {
      const S = window.__ENGINE.get('shading');
      await window.__GAME.setShot(name, { dt: 0 });
      const u = S.uniforms;
      const T = (await import('/src/render/ToonMaterial.js')).TUNE;
      return {
        keyColor: u.uKeyColor.value.toArray(), keyIntensity: u.uKeyIntensity.value,
        bounce: u.uBounceColor.value.toArray(), sky: u.uSkyColor.value.toArray(),
        shadowFloor: S._shadowFloor, shadowTint: S._shadowTint.toArray(),
        teal: T.shadowTeal, bounceMix: T.shadowBounceMix, peak: T.shadowTintPeak,
        light: u.uShadowColor.value.toArray(),
      };
    }, shot);
    res.inputs.push({ shot, ...r });
    console.log(`${shot.padEnd(11)} keyLum ${(lum(r.keyColor) * r.keyIntensity).toFixed(4)}  bounce (${r.bounce.map((v) => v.toFixed(4)).join(',')})`);
  }

  // C5 — release point on hero.
  res.peakSweep = await page.evaluate(async (peaks) => {
    const S = window.__ENGINE.get('shading');
    await window.__GAME.setShot('hero', { dt: 0 });
    const T = (await import('/src/render/ToonMaterial.js')).TUNE;
    const orig = T.shadowTintPeak, rows = [];
    for (const p of peaks) {
      T.shadowTintPeak = p; S._refreshShadowColor();
      rows.push({ peak: p, light: S.uniforms.uShadowColor.value.toArray() });
    }
    T.shadowTintPeak = orig; S._refreshShadowColor();
    return rows;
  }, PEAKS);

  // C6/C8 — key boost on hero, cap at its shipped 0.62.
  res.keySweep = await page.evaluate(async (facs) => {
    const S = window.__ENGINE.get('shading');
    await window.__GAME.setShot('hero', { dt: 0 });
    const u = S.uniforms;
    const base = u.uKeyIntensity.value, rows = [];
    for (const f of facs) {
      u.uKeyIntensity.value = base * f; S._refreshShadowColor();
      rows.push({ f, keyIntensity: u.uKeyIntensity.value, light: u.uShadowColor.value.toArray() });
    }
    u.uKeyIntensity.value = base; S._refreshShadowColor();
    return { base, rows };
  }, KEYF);

  return res;
});

writeFileSync(new URL('./clamp2.json', import.meta.url), JSON.stringify(out, null, 2));

console.log('\n================ REGISTERED CRITERIA ================');

/* C5 */
console.log('\nC5 — release point (hero):');
console.log('   shadowTintPeak   light luma');
const ps = out.peakSweep.map((r) => ({ p: r.peak, L: lum(r.light) }));
for (const r of ps) console.log(`   ${r.p.toFixed(4).padStart(9)}        ${r.L.toFixed(6)}`);
const flat = ps.filter((r) => r.p >= 0.5620), below = ps.filter((r) => r.p < 0.5620);
const flatOK = flat.every((r) => Math.abs(r.L - flat[0].L) === 0);
let monoOK = true;
for (let i = 1; i < below.length; i++) if (!(below[i].L > below[i - 1].L)) monoOK = false;
const knee = ps.find((r) => Math.abs(r.L - flat[0].L) === 0).p;
console.log(`   flat for all >= 0.5620?  ${flatOK ? 'YES' : 'NO'}    strictly increasing below?  ${monoOK ? 'YES' : 'NO'}`);
console.log(`   measured knee (lowest peak reaching the plateau): ${knee.toFixed(4)}   predicted in [0.56, 0.58]`);
console.log(`   C5 ${flatOK && monoOK && knee >= 0.56 && knee <= 0.58 ? 'CONFIRMED' : 'FALSIFIED'}`);

/* C6 / C8 */
console.log('\nC6 — shadow light under a key boost (hero, cap at shipped 0.62):');
console.log('   keyFactor   uKeyIntensity   light luma    vs f=1.00');
const k0 = lum(out.keySweep.rows[0].light);
for (const r of out.keySweep.rows) {
  console.log(`   ${r.f.toFixed(2).padStart(7)}    ${r.keyIntensity.toFixed(4).padStart(9)}     ${lum(r.light).toFixed(6)}    ${((lum(r.light) / k0 - 1) * 100).toFixed(2).padStart(6)}%`);
}
const rise = lum(out.keySweep.rows.at(-1).light) / k0 - 1;
const lo = out.keySweep.rows.filter((r) => r.f <= 1.10), hi = out.keySweep.rows.filter((r) => r.f >= 1.15);
const trackOK = lo.every((r) => Math.abs(lum(r.light) / k0 - r.f) < 0.01);
const flatHi = hi.every((r) => Math.abs(lum(r.light) - lum(hi[0].light)) < 1e-9);
console.log(`   tracks key linearly below f=1.10?  ${trackOK ? 'YES' : 'NO'}   flat at/above f=1.15?  ${flatHi ? 'YES' : 'NO'}`);
console.log(`   total rise 1.00 -> 2.60: ${(100 * rise).toFixed(2)}%   bar <= 12%   C6 ${trackOK && flatHi && rise <= 0.12 ? 'CONFIRMED' : 'FALSIFIED'}`);
const kRise = out.keySweep.rows.at(-1).keyIntensity / out.keySweep.rows[0].keyIntensity - 1;
console.log(`\nC8 POSITIVE CONTROL   uKeyIntensity moved ${(100 * kRise).toFixed(0)}%   bar >= 100%   ${kRise >= 1.0 ? 'FIRED' : 'DID NOT FIRE — C6 VOID'}`);

/* C7 — re-score the model with the live bounce */
const lerp = (a, b, t) => a.map((v, i) => v + (b[i] - v) * t), sc = (a, s) => a.map((v) => v * s);
const srgb2lin = (c) => (c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
const TURQ = [0x2f, 0xa8, 0xa0].map((v) => srgb2lin(v / 255));
console.log('\nC7 — model re-scored with the LIVE uBounceColor:');
let worst = 0, wshot = '';
for (const r of out.inputs) {
  const kl = lum(r.keyColor) * r.keyIntensity;
  const tb = lerp(r.shadowTint, TURQ, r.teal), tl = lum(tb);
  const k = Math.min((r.shadowFloor * kl) / tl, r.peak / Math.max(...tb));
  const col = lerp(sc(r.bounce, tl / lum(r.bounce)), tb, 1 - r.bounceMix);
  const e = Math.max(...sc(col, k).map((v, i) => Math.abs(v - r.light[i])));
  if (e > worst) { worst = e; wshot = r.shot; }
  console.log(`   ${r.shot.padEnd(11)} max |Δ| ${e.toExponential(2)}`);
}
console.log(`   worst ${worst.toExponential(2)} (${wshot})   bar < 0.002   C7 ${worst < 0.002 ? 'PASS' : 'FAIL'}`);

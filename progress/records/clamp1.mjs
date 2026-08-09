/**
 * clamp1.mjs — is `TUNE.shadowTintPeak` still the daylight shadow's operating point?
 *
 * Criteria registered in PREREG-clamp1.md BEFORE this ran. Uniform readback only: no render,
 * no framebuffer, no tonemap, so there is no drift floor to sit on. One boot, one lever.
 *
 *   node progress/records/clamp1.mjs
 */
import { withGame } from '../../tools/harness.mjs';
import { writeFileSync } from 'node:fs';

const SHOTS = ['hero', 'temple', 'courtyard', 'combat', 'dunes', 'traversal', 'interior', 'night'];
const ARMS = [
  ['ship', 0.62],
  ['peak400', 4.00],   // C2 null (outdoor) / C4 positive control (interior)
  ['peak030', 0.30],   // C3 positive control — MUST fire everywhere
];

const lum = (c) => 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];

const out = await withGame({ width: 640, height: 360, timeout: 300000 }, async ({ page, info }) => {
  console.log(`renderer: ${info.renderer}`);
  console.log(`shots available: ${info.shots.join(', ')}\n`);

  const rows = [];
  for (const shot of SHOTS) {
    if (!info.shots.includes(shot)) { console.log(`  (skip ${shot} — not a canonical shot)`); continue; }
    const r = await page.evaluate(async ([name, arms]) => {
      const S = window.__ENGINE.get('shading');
      // §251: dt 0 so the staging path's settle frames do not advance the world clock.
      await window.__GAME.setShot(name, { dt: 0 });
      const u = S.uniforms;
      const base = {
        keyColor: u.uKeyColor.value.toArray(),
        keyIntensity: u.uKeyIntensity.value,
        shadowFloor: S._shadowFloor,
        shadowTint: S._shadowTint.toArray(),
        teal: S.constructor.TUNE ? undefined : undefined,
      };
      const TUNE = (await import('/src/render/ToonMaterial.js')).TUNE;
      base.tuneTeal = TUNE.shadowTeal;
      base.tuneFloor = TUNE.shadowFloor;
      base.tunePeak = TUNE.shadowTintPeak;
      base.tuneBounceMix = TUNE.shadowBounceMix;
      base.tuneWash = TUNE.shadowWash;

      const legs = {};
      const orig = TUNE.shadowTintPeak;
      for (const [tag, v] of arms) {
        TUNE.shadowTintPeak = v;
        S._refreshShadowColor();
        legs[tag] = u.uShadowColor.value.toArray();
      }
      TUNE.shadowTintPeak = orig;
      S._refreshShadowColor();
      return { base, legs };
    }, [shot, ARMS]);

    rows.push({ shot, ...r });
    const kl = lum(r.base.keyColor) * r.base.keyIntensity;
    console.log(`${shot.padEnd(11)} keyLum ${kl.toFixed(4)}  floor ${r.base.shadowFloor}  ` +
      `tint (${r.base.shadowTint.map((v) => v.toFixed(4)).join(',')})`);
    for (const [tag] of ARMS) {
      console.log(`   ${tag.padEnd(8)} light (${r.legs[tag].map((v) => v.toFixed(5)).join(', ')})  luma ${lum(r.legs[tag]).toFixed(5)}`);
    }
  }
  return rows;
});

writeFileSync(new URL('./clamp1.json', import.meta.url), JSON.stringify(out, null, 2));

/* ---- score against the registered criteria ------------------------------------------- */
console.log('\n================ REGISTERED CRITERIA ================');
const OUTDOOR = ['hero', 'temple', 'courtyard', 'combat', 'dunes', 'traversal'];

// C1 — model validity, against the offline transcription
const srgb2lin = (c) => (c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
const hex2lin = (h) => [srgb2lin(((h >> 16) & 255) / 255), srgb2lin(((h >> 8) & 255) / 255), srgb2lin((h & 255) / 255)];
const lerpc = (a, b, t) => a.map((v, i) => v + (b[i] - v) * t);
const scalec = (a, s) => a.map((v) => v * s);
const TURQ = hex2lin(0x2fa8a0), BOUNCE = hex2lin(0xe8a852);

function model({ tint, keyLum, floor, teal, peakCap, bounceMix }) {
  const tb = lerpc(tint, TURQ, teal);
  const tl = lum(tb);
  const kAsked = (floor * keyLum) / Math.max(tl, 1e-4);
  const peak = Math.max(...tb);
  const maxK = peakCap / Math.max(peak, 1e-4);
  const k = Math.min(kAsked, maxK);
  const bScale = tl / lum(BOUNCE);
  const col = lerpc(scalec(BOUNCE, bScale), tb, 1 - bounceMix);
  return { light: scalec(col, k), k, kAsked, maxK, clamped: kAsked > maxK };
}

let c1worst = 0, c1shot = '';
for (const r of out) {
  const kl = lum(r.base.keyColor) * r.base.keyIntensity;
  const m = model({
    tint: r.base.shadowTint, keyLum: kl, floor: r.base.shadowFloor,
    teal: r.base.tuneTeal, peakCap: 0.62, bounceMix: r.base.tuneBounceMix,
  });
  const e = Math.max(...m.light.map((v, i) => Math.abs(v - r.legs.ship[i])));
  if (e > c1worst) { c1worst = e; c1shot = r.shot; }
  r._model = m;
}
console.log(`C1 model validity      max |Δ| ${c1worst.toExponential(2)} (worst: ${c1shot})   bar < 0.002   ${c1worst < 0.002 ? 'PASS' : 'FAIL — nothing below is quotable'}`);

// C2 — null arm: 0.62 -> 4.00 bit-identical outdoors
let c2fail = [];
for (const r of out.filter((x) => OUTDOOR.includes(x.shot))) {
  const d = Math.max(...r.legs.ship.map((v, i) => Math.abs(v - r.legs.peak400[i])));
  if (d !== 0) c2fail.push(`${r.shot} Δ${d.toExponential(2)}`);
}
console.log(`C2 cap inert upward    ${c2fail.length === 0 ? 'all outdoor shots bit-identical (Δ == 0)  PASS' : 'FAIL: ' + c2fail.join(', ')}`);

// C3 — positive control: 0.62 -> 0.30 must move >= 20% luma everywhere
let c3min = Infinity, c3shot = '';
for (const r of out.filter((x) => OUTDOOR.includes(x.shot))) {
  const rel = Math.abs(lum(r.legs.peak030) - lum(r.legs.ship)) / lum(r.legs.ship);
  if (rel < c3min) { c3min = rel; c3shot = r.shot; }
}
console.log(`C3 POSITIVE CONTROL    min luma move ${(100 * c3min).toFixed(1)}% (worst: ${c3shot})   bar >= 20%   ${c3min >= 0.20 ? 'FIRED' : 'DID NOT FIRE — run VOID'}`);

// C4 — interior must move on the 4.00 arm
const inter = out.find((x) => x.shot === 'interior');
if (inter) {
  const rel = Math.abs(lum(inter.legs.peak400) - lum(inter.legs.ship)) / lum(inter.legs.ship);
  console.log(`C4 interior clamped    luma move ${(100 * rel).toFixed(1)}%   bar >= 20%   ${rel >= 0.20 ? 'FIRED' : 'did not fire'}`);
}

console.log('\n  per-shot model verdict (live inputs):');
console.log('   shot         keyLum   floor    k asked   maxK    k used   clamped?');
for (const r of out) {
  const kl = lum(r.base.keyColor) * r.base.keyIntensity;
  const m = r._model;
  console.log(`   ${r.shot.padEnd(11)}  ${kl.toFixed(3).padStart(6)}  ${String(r.base.shadowFloor).padStart(6)}   ${m.kAsked.toFixed(3).padStart(6)}   ${m.maxK.toFixed(3)}   ${m.k.toFixed(3)}   ${m.clamped ? 'YES' : 'no'}`);
}

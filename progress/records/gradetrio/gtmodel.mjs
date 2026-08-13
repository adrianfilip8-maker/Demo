/**
 * gtmodel.mjs — derivation model for the three GRADE seals (b) tombdim (c) goldenrake
 * (d) nightfloor. Drives the REAL modules — evalAtmosphere + Shading.setKeyLight — so the
 * shadow light, fill and key are the live arithmetic, not a transcription; only the last
 * mile (the TOON_SHADE diff assembly for one flat surface) is transcribed, from
 * toon.glsl.js:704-707 verbatim. Display via tonecurve.mjs (validated grey row).
 *
 *   node progress/records/gradetrio/gtmodel.mjs   (runs against the LIVE modules — the mechanisms must be in the tree)
 */
import * as THREE from 'three';
import { createAtmosphereState, evalAtmosphere } from '../../../src/render/Atmosphere.js';
import { Shading, TUNE } from '../../../src/render/ToonMaterial.js';
import { grade } from '../tonecurve.mjs';

const lum3 = (c) => 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
const lumC = (c) => 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b;
const srgb2lin = (c) => (c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
const hex2lin = (h) => [srgb2lin(((h >> 16) & 255) / 255), srgb2lin(((h >> 8) & 255) / 255), srgb2lin((h & 255) / 255)];
const smoothstep = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const displayL = (rgb) => lum3(grade(rgb));

/** Build the _publishKeyLight payload for a tod (Lighting.js:2028 shape, boosts 1). */
function payloadFor(tod) {
  const s = createAtmosphereState();
  evalAtmosphere(tod, s);
  return {
    s,
    p: {
      direction: s.keyDir, color: s.keyColor, intensity: s.keyIntensity,
      ambient: {
        sky: s.hemiSky, ground: s.hemiGround, intensity: s.ambientIntensity,
        floor: s.shadowFloor, tint: s.shadowTint,
      },
      nightAmount: s.nightAmount, local: 2.5,
    },
  };
}

/** One flat-surface toon pixel through the transcribed diff assembly (arch: vSlySkin 0,
 *  uShadowHold 0 -> hold 0; rim/sss/spec/local omitted — stated). */
function pixel(sh, { alb, ny, ramp, shadow /* sh in [0,1] */, ao = 1 }) {
  const u = sh.uniforms;
  const key = ramp * shadow;
  const shadowMix = 1 - key;
  const albL = lum3(alb);
  const albShadow = alb.map((x, i) => Math.min(1, Math.max(0, albL + (x - albL) * (1 + TUNE.shadowSat))));
  const albAmb = alb.map((x, i) => x + (albShadow[i] - x) * shadowMix);
  const sky = [u.uSkyColor.value.r, u.uSkyColor.value.g, u.uSkyColor.value.b];
  const bounce = [u.uBounceColor.value.r, u.uBounceColor.value.g, u.uBounceColor.value.b];
  const bl = lum3(bounce), sl = lum3(sky);
  const bounceLeg = bounce.map((x, i) => x + (sky[i] * (bl / Math.max(sl, 1e-4)) - x) * TUNE.fillSkyMix);
  const hemi = smoothstep(-0.72, 0.55, ny);
  const fill = bounceLeg.map((x, i) => (x * TUNE.bounceGain + (sky[i] - x * TUNE.bounceGain) * hemi) * u.uAmbIntensity.value);
  const sc = [u.uShadowColor.value.r, u.uShadowColor.value.g, u.uShadowColor.value.b];
  const scl = [u.uShadowColorLit.value.r, u.uShadowColorLit.value.g, u.uShadowColorLit.value.b];
  const dep = smoothstep(TUNE.shadowDepth[0], TUNE.shadowDepth[1], shadowMix);
  const shadX = scl.map((x, i) => x + (sc[i] - x) * dep);
  const shadBand = albShadow.map((x, i) => x * shadX[i]);
  const shadeForm = 1 - TUNE.shadeBand * (1 - ramp);
  const keyRad = [u.uKeyColor.value.r, u.uKeyColor.value.g, u.uKeyColor.value.b].map((x) => x * u.uKeyIntensity.value);
  return alb.map((a, i) =>
    a * keyRad[i] * key
    + (albAmb[i] * fill[i] * ao
      + shadBand[i] * shadowMix * (0.55 + 0.45 * ao)
      + shadX[i] * TUNE.shadowWash * shadowMix * ao) * shadeForm);
}

/** Shading instance fed with a payload; optional debug + camera + floor overrides. */
function shadingFor(pl, { debug = {}, camY = 10 } = {}) {
  const eng = { debug, camera: { position: { y: camY } } };
  const sh = new Shading(eng);
  sh.setKeyLight(pl.p);
  return sh;
}

const SAND_MID = hex2lin(0xc9915a);
const SAND_LIGHT = hex2lin(0xe6b878);
const LIME_MID = hex2lin(0xd4c19a);
const PAVE = hex2lin(0xb08050); // paving-ish warm stone stand-in

/* ── validation: the §261/clamp2 k table ─────────────────────────────────────────────── */
console.log('== validation vs KNOWN_ISSUES §261 clamp2 table (k used) ==');
for (const [name, tod, expect] of [['hero', 0.79, 3.392], ['temple', 0.72, 3.560], ['dunes', 0.83, 2.639], ['interior', 0.5, 3.742], ['night', 0.02, 0.468]]) {
  const pl = payloadFor(tod);
  const sh = shadingFor(pl);
  const u = sh.uniforms;
  const keyLum = lumC(u.uKeyColor.value) * u.uKeyIntensity.value;
  // recover k: uShadowColor = mix(bounce_lumamatched, tintBlend, 1-bounceMix) * k; take lum ratio
  const tint = new THREE.Color(0x2a3f66).lerp(new THREE.Color(0x2fa8a0), TUNE.shadowTeal);
  const tintLum = lumC(tint);
  const k = lumC(u.uShadowColor.value) / tintLum; // bounce mix is luma-matched so lum(base)=tintLum
  console.log(`  ${name.padEnd(9)} keyLum ${keyLum.toFixed(3)}  k ${k.toFixed(3)}  (clamp2: ${expect})  ${Math.abs(k - expect) < 0.02 ? 'OK' : 'DRIFT'}`);
}

/* ── (d) nightfloor: night/guard wall + deck, off vs 0.14 vs 0.18 ───────────────────── */
console.log('\n== (d) nightfloor — night tod 0.02 / guard tod 0.10, backlit wall (ramp 0, sh 0) ==');
for (const tod of [0.02, 0.10]) {
  const pl = payloadFor(tod);
  for (const [alb, an] of [[SAND_MID, 'sandMid'], [LIME_MID, 'limeMid']]) {
    const row = [];
    for (const nf of [null, 0.14, 0.18]) {
      const sh = shadingFor(pl, { debug: nf === null ? {} : { shadowFloorNight: nf } });
      const wall = pixel(sh, { alb, ny: 0, ramp: 0, shadow: 0, ao: 0.85 });
      row.push(`${nf === null ? 'off ' : nf}: L ${displayL(wall).toFixed(1)}`);
    }
    console.log(`  tod ${tod} wall ${an.padEnd(8)} ${row.join('   ')}`);
    const rowD = [];
    for (const nf of [null, 0.14, 0.18]) {
      const sh = shadingFor(pl, { debug: nf === null ? {} : { shadowFloorNight: nf } });
      const deck = pixel(sh, { alb, ny: 1, ramp: 0.5, shadow: 1, ao: 0.85 }); // moonlit deck mid-band
      rowD.push(`${nf === null ? 'off ' : nf}: L ${displayL(deck).toFixed(1)}`);
    }
    console.log(`  tod ${tod} deck ${an.padEnd(8)} ${rowD.join('   ')}`);
  }
}
{ // hue of the night shadow light, off vs 0.14 — must not rotate
  const pl = payloadFor(0.02);
  const a = shadingFor(pl), b = shadingFor(pl, { debug: { shadowFloorNight: 0.14 } });
  const va = a.uniforms.uShadowColor.value, vb = b.uniforms.uShadowColor.value;
  console.log(`  uShadowColor off (${va.r.toFixed(4)},${va.g.toFixed(4)},${va.b.toFixed(4)}) -> 0.14 (${vb.r.toFixed(4)},${vb.g.toFixed(4)},${vb.b.toFixed(4)})  ratio ${(vb.r / va.r).toFixed(4)}/${(vb.g / va.g).toFixed(4)}/${(vb.b / va.b).toFixed(4)}`);
}

/* ── (b) tombdim: interior tod 0.5, camera y -9.2; wall/floor class + pool add ───────── */
console.log('\n== (b) tombdim — interior tod 0.5, cam y -9.2, shadowed surfaces (ramp 0, sh 0) ==');
{
  const pl = payloadFor(0.5);
  const base = shadingFor(pl, { camY: -9.2 });
  console.log(`  interior uAmbIntensity ${base.uniforms.uAmbIntensity.value.toFixed(3)}  uShadowColor lum ${lumC(base.uniforms.uShadowColor.value).toFixed(4)}`);
  // pool radiance: solve from torchlight3's measured POOL 70.7 -> 95.0 display L on the floor.
  // Model floor base first, fit an effective albedo scale so base matches 70.7, then the
  // pool add in scene space is fixed; recompute at each dim arm.
  const arms = [null, 0.5, 0.3, 0.15];
  for (const [alb, ny, an, meas] of [[LIME_MID, 1, 'floor(FAR-class)', 61.8], [SAND_MID, 0, 'pier wall', null]]) {
    const off = pixel(shadingFor(pl, { camY: -9.2 }), { alb, ny, ramp: 0, shadow: 0, ao: 0.85 });
    let line = `  ${an.padEnd(17)} off L ${displayL(off).toFixed(1)}${meas ? ` (measured ${meas})` : ''}`;
    for (const ta of arms.slice(1)) {
      const sh = shadingFor(pl, { debug: { tombAmb: ta }, camY: -9.2 });
      const px = pixel(sh, { alb, ny, ramp: 0, shadow: 0, ao: 0.85 });
      line += `   ${ta}: L ${displayL(px).toFixed(1)}`;
    }
    console.log(line);
  }
  // pool contrast: pool add fitted on the floor class
  const off = pixel(shadingFor(pl, { camY: -9.2 }), { alb: LIME_MID, ny: 1, ramp: 0, shadow: 0, ao: 0.85 });
  // fit scalar s so displayL(off*s) == 70.7 (the measured POOL rect base)
  let s = 1;
  for (let i = 0; i < 40; i++) { const L = displayL(off.map((x) => x * s)); s *= L > 70.7 ? 0.97 : 1.03; }
  const offP = off.map((x) => x * s);
  // pool add: solve additive warm a*[1,0.55,0.25] so displayL(offP+add) == 95.0
  let g = 0.05;
  const addv = (gg) => offP.map((x, i) => x + gg * [1.0, 0.55, 0.25][i]);
  for (let i = 0; i < 60; i++) { const L = displayL(addv(g)); g *= L > 95.0 ? 0.97 : 1.03; }
  console.log(`  pool fit: base scale ${s.toFixed(3)} -> L ${displayL(offP).toFixed(1)}; add gain ${g.toFixed(4)} -> pool L ${displayL(addv(g)).toFixed(1)}`);
  for (const ta of [0.5, 0.3, 0.15]) {
    const sh = shadingFor(pl, { debug: { tombAmb: ta }, camY: -9.2 });
    const dim = pixel(sh, { alb: LIME_MID, ny: 1, ramp: 0, shadow: 0, ao: 0.85 }).map((x) => x * s);
    const dimPool = dim.map((x, i) => x + g * [1.0, 0.55, 0.25][i]);
    console.log(`    tombAmb ${ta}: floor L ${displayL(dim).toFixed(1)}  pool L ${displayL(dimPool).toFixed(1)}  pool-floor dL ${(displayL(dimPool) - displayL(dim)).toFixed(1)} (off dL ${(displayL(addv(g)) - displayL(offP)).toFixed(1)})`);
  }
  // protection: same debug poke, cam y = 2.6 (temple) and 1.45 — factor must be exactly 1
  const a = shadingFor(pl, { debug: { tombAmb: 0.3 }, camY: 2.6 });
  const b = shadingFor(pl, { camY: 2.6 });
  const same = a.uniforms.uAmbIntensity.value === b.uniforms.uAmbIntensity.value
    && a.uniforms.uShadowColor.value.r === b.uniforms.uShadowColor.value.r;
  console.log(`  above-ground identity at poke (cam y 2.6): ${same ? 'EXACT' : 'BROKEN'}`);
}

/* ── (c) goldenrake: hero tod 0.79 floor, ramp 0.5 -> 1.0 ────────────────────────────── */
console.log('\n== (c) goldenrake — hero tod 0.79 sunlit floor (sh 1), ramp 0.5 vs 1.0 ==');
{
  const pl = payloadFor(0.79);
  const sh = shadingFor(pl);
  for (const [alb, an] of [[PAVE, 'paving'], [SAND_MID, 'sandMid'], [SAND_LIGHT, 'sandLight']]) {
    const mid = pixel(sh, { alb, ny: 1, ramp: 0.5, shadow: 1, ao: 0.85 });
    const full = pixel(sh, { alb, ny: 1, ramp: 1.0, shadow: 1, ao: 0.85 });
    const shad = pixel(sh, { alb, ny: 1, ramp: 0.5, shadow: 0, ao: 0.85 }); // cast shadow on the same floor
    console.log(`  ${an.padEnd(9)} mid L ${displayL(mid).toFixed(1)}  full L ${displayL(full).toFixed(1)}  (+${(displayL(full) - displayL(mid)).toFixed(1)})   castShadow L ${displayL(shad).toFixed(1)}  lit:shadow ${(displayL(full) / displayL(shad)).toFixed(2)} (was ${(displayL(mid) / displayL(shad)).toFixed(2)})`);
  }
  // dose 0.5: ramp = 0.5 + 0.5*0.5 = 0.75
  const d = pixel(sh, { alb: PAVE, ny: 1, ramp: 0.75, shadow: 1, ao: 0.85 });
  console.log(`  paving dose(track 0.5) ramp0.75 L ${displayL(d).toFixed(1)}`);
  // kaykit tod 0.30 floor: same el 22 -> same promo; report
  const plk = payloadFor(0.30);
  const shk = shadingFor(plk);
  const midk = pixel(shk, { alb: SAND_MID, ny: 1, ramp: 0.5, shadow: 1, ao: 0.85 });
  const fullk = pixel(shk, { alb: SAND_MID, ny: 1, ramp: 1.0, shadow: 1, ao: 0.85 });
  console.log(`  kaykit floor mid L ${displayL(midk).toFixed(1)} -> full ${displayL(fullk).toFixed(1)}`);
  // dunes tod 0.83 (el 15): slope ny 0.9
  const pld = payloadFor(0.83);
  const shd = shadingFor(pld);
  const midd = pixel(shd, { alb: SAND_LIGHT, ny: 0.9, ramp: 0.5, shadow: 1, ao: 0.9 });
  const fulld = pixel(shd, { alb: SAND_LIGHT, ny: 0.9, ramp: 1.0, shadow: 1, ao: 0.9 });
  console.log(`  dunes slope mid L ${displayL(midd).toFixed(1)} -> full ${displayL(fulld).toFixed(1)}  (el ${pld.s.sunElevation.toFixed(1)})`);
  // rakeHi at the stagings
  for (const tod of [0.79, 0.80, 0.30, 0.83, 0.76, 0.72, 0.5]) {
    const s = payloadFor(tod).s;
    const hi = Math.min(Math.max(s.keyDir.y - 0.05, TUNE.termLo + 2 * TUNE.termSoft), TUNE.termHi);
    console.log(`    tod ${tod}: el ${s.sunElevation.toFixed(1)}  keyDir.y ${s.keyDir.y.toFixed(4)}  rakeHi ${hi.toFixed(4)}  ${hi >= TUNE.termHi ? 'IDENTITY (clamped to termHi)' : `floors(0.3746@el22) ${0.3746 >= hi + TUNE.termSoft ? 'FULL' : 'partial'}`}`);
  }
}

/* ── channel/hue detail for the bar bands ─────────────────────────────────────────────── */
const hueOf = (rgb) => {
  const [R, G, B] = rgb.map((x) => x / 255);
  const mx = Math.max(R, G, B), mn = Math.min(R, G, B), d = mx - mn;
  if (d < 1e-6) return NaN;
  let h;
  if (mx === R) h = ((G - B) / d) % 6; else if (mx === G) h = (B - R) / d + 2; else h = (R - G) / d + 4;
  h *= 60; if (h < 0) h += 360; return h;
};
console.log('\n== channel detail ==');
{
  const pl = payloadFor(0.79); const sh = shadingFor(pl);
  for (const [alb, an] of [[PAVE, 'hero paving'], [SAND_MID, 'hero sandMid']]) {
    const mid = grade(pixel(sh, { alb, ny: 1, ramp: 0.5, shadow: 1, ao: 0.85 }));
    const full = grade(pixel(sh, { alb, ny: 1, ramp: 1.0, shadow: 1, ao: 0.85 }));
    console.log(`  (c) ${an}: mid RGB(${mid.map((x) => x.toFixed(0))}) RB ${(mid[0] - mid[2]).toFixed(1)} hue ${hueOf(mid).toFixed(1)} -> full RGB(${full.map((x) => x.toFixed(0))}) RB ${(full[0] - full[2]).toFixed(1)} hue ${hueOf(full).toFixed(1)}`);
  }
  const pln = payloadFor(0.02);
  for (const nf of [null, 0.14, 0.18]) {
    const shn = shadingFor(pln, { debug: nf === null ? {} : { shadowFloorNight: nf } });
    const wall = grade(pixel(shn, { alb: SAND_MID, ny: 0, ramp: 0, shadow: 0, ao: 0.85 }));
    console.log(`  (d) night wall ${nf ?? 'off '}: RGB(${wall.map((x) => x.toFixed(0))}) RB ${(wall[0] - wall[2]).toFixed(1)} hue ${hueOf(wall).toFixed(1)}`);
  }
  const pli = payloadFor(0.5);
  for (const ta of [null, 0.3, 0.15]) {
    const shi = shadingFor(pli, { debug: ta === null ? {} : { tombAmb: ta }, camY: -9.2 });
    const w = grade(pixel(shi, { alb: LIME_MID, ny: 0, ramp: 0, shadow: 0, ao: 0.85 }));
    console.log(`  (b) tomb wall ${ta ?? 'off '}: RGB(${w.map((x) => x.toFixed(0))}) RB ${(w[0] - w[2]).toFixed(1)} hue ${hueOf(w).toFixed(1)} B-max ${(w[2] - Math.max(w[0], w[1])).toFixed(1)}`);
  }
}

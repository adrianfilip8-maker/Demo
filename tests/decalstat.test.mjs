/**
 * decalstat.test.mjs — the first instrument for `Decals.js` and `Statues.js`.
 *
 * ── the premise, third time ───────────────────────────────────────────────────────────────────
 * These were the last two world modules nobody had instrumented, and unlike KayKit (§395) and
 * Vegetation/Water (§397) **neither carries a "cannot be measured" claim to disprove.** The
 * opposite: `Decals.js` says of `contactDiscGeometry` that it is *"pure and GL-free on purpose:
 * it is the one part of this file a Node test can check"*, and of `reachFor` that it is *"the JS
 * mirror of the vertex shader's one line, so a Node test can check the arithmetic the frame will
 * actually run."* Both were written for a test that was never written. `Statues.js` exports seven
 * pure builder functions and needs no engine at all.
 *
 * So the finding here is not that a barrier was imaginary. It is that **an open door is not the
 * same as a visitor**, and three rounds of "nobody could measure this" have been sharing a
 * ledger with a file that asked to be measured in its own header.
 *
 * ── one methodological result, recorded because it nearly shipped as a finding ────────────────
 * Calling `sphinx()` eight times in isolation with the `worn` values `Props.js` uses returns
 * **one silhouette at 5 cm quantisation**, which reads exactly like `basketvary`'s rope-coil
 * clone family. It is wrong. `Props._sphinxAvenue` applies a per-instance `s: 1 + rng.jitter(0.04)`
 * at placement, and measured through a real `Props.init()` the same sixteen sphinxes carry **ten**
 * distinct silhouettes. The isolated call was measuring something adjacent to what ships — §393.2's
 * exact failure — and the only thing that caught it was booting the real module. Every statue arm
 * below therefore reads bags out of `Props._absorb` rather than calling the builders directly.
 *
 * Every data-driven arm asserts a non-zero inspected count (§211.1).
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { SHOTS } from '../src/core/Shots.js';
import {
  TUNE, contactDiscGeometry, tintMultiplier, reachFor, shadowLengthOf, SHADOW_LEN_MAX,
  groundFootprint, baseRadiusOf,
} from '../src/world/Decals.js';
import { Props } from '../src/world/Props.js';
import * as STATUES from '../src/world/Statues.js';
import { rng } from '../src/core/Rand.js';
import { Architecture } from '../src/world/Architecture.js';

const DECALS_SRC = readFileSync(new URL('../src/world/Decals.js', import.meta.url), 'utf8');
const STATUES_SRC = readFileSync(new URL('../src/world/Statues.js', import.meta.url), 'utf8');

/** A number stated in a source comment — §395.3's standard, applied to two more files. */
function claim(src, re, label) {
  const m = re.exec(src);
  assert.ok(m, `could not find the claim "${label}" — the comment was reworded, so this arm is no `
    + 'longer checking anything and must be re-anchored');
  return m.slice(1).map(Number);
}
const agrees = (measured, claimed, tol, what) => assert.ok(Math.abs(measured - claimed) <= tol,
  `${what}: the comment says ${claimed}, measurement says ${measured.toFixed(4)} (tolerance ${tol})`);

/* ── boot Props for real: statues only exist once Props has placed them ─────────────────────── */
const BAGS = [];
let label = '?';
const origAbsorb = Props.prototype._absorb;
Props.prototype._absorb = function (bag, ...rest) {
  if (bag?.parts?.length) {
    const bb = new THREE.Box3();
    let tris = 0;
    for (const p of bag.parts) {
      p.geo.computeBoundingBox();
      bb.union(p.geo.boundingBox);
      tris += (p.geo.index ? p.geo.index.count : p.geo.attributes.position.count) / 3;
    }
    BAGS.push({ label, bb: bb.clone(), tris, parts: bag.parts.length });
  }
  return origAbsorb.call(this, bag, ...rest);
};
for (const fn of ['_sphinxAvenue', '_colossi']) {
  const orig = Props.prototype[fn];
  if (typeof orig !== 'function') continue;
  Props.prototype[fn] = function (...a) {
    const prev = label; label = fn;
    try { return orig.apply(this, a); } finally { label = prev; }
  };
}
const REG = [];
const engine = {
  quality: 'high', scene: new THREE.Scene(), debug: {}, stats: {}, warn: () => {},
  get: () => null, has: () => false, on: () => () => {}, emit: () => {},
  registerCollider: (m, o) => REG.push({ mesh: m, opts: o }),
};
await new Architecture(engine).init();
const P = new Props(engine);
await P.init();
Props.prototype._absorb = origAbsorb;

const SPHINX = BAGS.filter((b) => b.label === '_sphinxAvenue' && b.tris > 1000);
const FALLEN = BAGS.filter((b) => b.label === '_sphinxAvenue' && b.tris <= 1000);
const COLOSSI = BAGS.filter((b) => b.label === '_colossi');

console.log(`\n[decalstat] document=${typeof document} · ${BAGS.length} bags absorbed · `
  + `${SPHINX.length} avenue sphinxes, ${COLOSSI.length} colossi · ${P.decals.count} contact decals\n`);

const camOf = (s) => {
  const c = new THREE.PerspectiveCamera(s.fov, 16 / 9, 0.1, 600);
  c.position.fromArray(s.pos); c.lookAt(new THREE.Vector3().fromArray(s.target));
  if (s.roll) c.rotateZ(THREE.MathUtils.degToRad(s.roll));
  c.updateMatrixWorld(true); c.updateProjectionMatrix(); return c;
};

/* =========================== 1. Decals: the pure core =========================== */

test('P1: the contact disc is the five-ring band profile its own docblock tabulates', () => {
  /* The docblock states the rings and alphas outward as a table. That table IS the header's
     claim about the shape — "two flat tones separated by steps whose half-width is TUNE.soft" —
     so it is read out of the comment and rebuilt, not restated here. */
  const d = contactDiscGeometry();
  const seg = TUNE.segments;
  console.log(`  P1: rings ${d.rings.map((r) => r.toFixed(4)).join(' ')} · alphas ${d.alphas.join(' ')} `
    + `· ${d.position.length / 3} verts, ${d.index.length / 3} tris`);

  assert.equal(d.rings.length, 5, 'the profile is five rings');
  assert.deepEqual(d.alphas, [1, 1, TUNE.skirt, TUNE.skirt, 0], 'core, core, skirt, skirt, zero');
  /* "normalise so the outermost ring is exactly 1.0 — `radius` then means what it says" */
  assert.equal(d.rings[4], 1, 'the outermost ring must be exactly 1.0 or `radius` lies');
  assert.equal(d.rings[0], 0, 'the innermost ring is the centre');
  for (let i = 1; i < d.rings.length; i++) {
    assert.ok(d.rings[i] > d.rings[i - 1], `ring ${i} does not increase`);
  }
  /* the unnormalised profile is [0, core-soft, core+soft, edge-soft, edge+soft] */
  const outer = TUNE.edge + TUNE.soft;
  const want = [0, TUNE.core - TUNE.soft, TUNE.core + TUNE.soft, TUNE.edge - TUNE.soft, TUNE.edge + TUNE.soft]
    .map((v) => v / outer);
  for (let i = 0; i < 5; i++) agrees(d.rings[i], want[i], 1e-9, `ring ${i}`);

  /* geometry sanity: every vertex on its ring, flat, and every index in range */
  let offRing = 0;
  for (let r = 0; r < d.rings.length; r++) {
    for (let i = 0; i < seg; i++) {
      const k = (r * seg + i) * 3;
      if (Math.abs(Math.hypot(d.position[k], d.position[k + 2]) - d.rings[r]) > 1e-6) offRing++;
      if (d.position[k + 1] !== 0) offRing++;
    }
  }
  assert.equal(offRing, 0, 'a disc vertex is off its ring radius or off the ground plane');
  assert.equal(d.position.length / 3, 5 * seg, 'vertex count is rings x segments');
  assert.equal(d.index.length, (d.rings.length - 1) * seg * 6, 'index count is one quad per ring gap per segment');
  assert.ok(Math.max(...d.index) === d.position.length / 3 - 1, 'the index does not reach the last vertex');
  assert.ok(Math.min(...d.index) === 0, 'the index does not start at the first vertex');

  /* the step half-width claim: 2*soft of the radius separates the two flat tones */
  const step = d.rings[2] - d.rings[1];
  agrees(step, (2 * TUNE.soft) / outer, 1e-9, 'the core->skirt step width');
});

test('P1 CALIBRATION: a soft gradient disc IS rejected by the same structure test', () => {
  /* MUST FIRE. P1 asserts a HARD two-tone profile, and the header's whole argument is that a
     radial gradient is the wrong answer here ("squint at a frame with a soft blob under a barrel
     and the blob is the only smoothly-shaded object in it"). The lever is that gradient: a tune
     whose alphas ramp continuously instead of stepping. */
  const gradient = { ...TUNE, core: 0.25, edge: 0.95, soft: 0.35, skirt: 0.5 };
  const d = contactDiscGeometry(gradient);
  const step = d.rings[2] - d.rings[1];
  const hard = contactDiscGeometry();
  const hardStep = hard.rings[2] - hard.rings[1];
  console.log(`  P1 calib: a soft profile steps over ${step.toFixed(3)} of the radius against the shipped ${hardStep.toFixed(3)}`);
  assert.ok(step > 5 * hardStep,
    `a deliberately-soft profile stepped over ${step.toFixed(3)}, barely different from the shipped `
    + `${hardStep.toFixed(3)} — P1's step-width assertion cannot tell a step from a ramp`);
});

test('P2: `reachFor` really is the JS mirror of the vertex shader line', () => {
  /* The docblock's claim is that this function and the GLSL agree. Checked two ways: the GLSL
     line is still the shape the mirror was written against, and the two agree numerically over a
     sweep that crosses the cap in both directions. */
  const m = /float reach = min\(\s*uReach\.y,\s*uReach\.x \* iHeight \* uShadowLen\s*\)/.exec(DECALS_SRC);
  assert.ok(m, 'the vertex shader\'s reach line is no longer `min(uReach.y, uReach.x * iHeight * uShadowLen)`, '
    + 'so `reachFor` is no longer a mirror of anything and its docblock is wrong');
  let checked = 0, worst = 0, capped = 0, uncapped = 0;
  for (let h = 0; h <= 6; h += 0.25) {
    for (let sl = 0; sl <= SHADOW_LEN_MAX; sl += 0.5) {
      const glsl = Math.min(TUNE.reachCap, TUNE.reachFrac * h * sl);
      const js = reachFor(h, sl);
      worst = Math.max(worst, Math.abs(glsl - js));
      if (js >= TUNE.reachCap - 1e-12) capped++; else uncapped++;
      checked++;
    }
  }
  console.log(`  P2: ${checked} (height, shadowLen) pairs — ${capped} capped, ${uncapped} below the cap, worst delta ${worst}`);
  assert.ok(checked > 0, 'inspected 0 pairs');
  assert.ok(capped > 0 && uncapped > 0, 'the sweep never crossed the cap, so it did not test the min()');
  assert.equal(worst, 0, 'the JS mirror and the shader arithmetic disagree');
  /* negatives are clamped, so a bad height cannot push a decal upwind */
  assert.equal(reachFor(-5, 2), 0, 'a negative height must not produce reach');
  assert.equal(reachFor(2, -5), 0, 'a negative shadow length must not produce reach');
});

test('P3: `shadowLengthOf` is cot(elevation), clamped, and the four tods it names re-derive', () => {
  /* "night's moon sits at 12 degrees and guard's at 28, so the clamp is what stops a NaN reaching
     a vertex buffer at the two tods this project actually ships below 15 degrees." */
  const at = (deg) => shadowLengthOf(new THREE.Vector3(Math.cos(THREE.MathUtils.degToRad(deg)), Math.sin(THREE.MathUtils.degToRad(deg)), 0));
  const rows = [76, 26, 28, 12].map((d) => ({ d, got: at(d), want: 1 / Math.tan(THREE.MathUtils.degToRad(d)) }));
  console.log('  P3: ' + rows.map((r) => `${r.d}deg -> ${r.got.toFixed(4)}`).join(' · ') + ` · clamp ${SHADOW_LEN_MAX}`);
  for (const r of rows) agrees(r.got, r.want, 1e-9, `cot(${r.d}deg)`);
  /* the two the docblock names as below 15 degrees must still be finite and under the clamp */
  const [cNight, cGuard] = claim(DECALS_SRC, /`night`'s moon sits at (\d+) degrees and `guard`'s at (\d+)/, 'the two low tods');
  assert.ok(at(cNight) < SHADOW_LEN_MAX, `a ${cNight}deg key already saturates the clamp, so the clamp is doing the visual limiting`);
  assert.ok(at(cGuard) < SHADOW_LEN_MAX, `a ${cGuard}deg key already saturates the clamp`);
  /* on and below the horizon: finite, never NaN — the thing the clamp exists for */
  for (const y of [0, -0.5, -1]) {
    const v = shadowLengthOf(new THREE.Vector3(1, y, 0));
    assert.ok(Number.isFinite(v) && v === SHADOW_LEN_MAX, `a key at y=${y} returned ${v}`);
  }
  assert.ok(Number.isFinite(shadowLengthOf(new THREE.Vector3(0, 0, 0))), 'a zero key must not produce NaN');
});

test('P4: `tintMultiplier` leaves tintDark as the only darkness dial', () => {
  /* "The hue is normalised by its own brightest channel first, so `tintDark` is the only thing
     that decides how dark the contact goes and `tintSat` is the only thing that decides how
     coloured it is." That is a claim about independence, so it is tested as one.

     DELIBERATELY BLIND TO THE VALUE. Every assertion here and in D1 is relative to the live
     `TUNE.tintDark`, so changing 0.46 to 0.60 passes — verified with a planted edit, which is why
     it is written down rather than left to look like a hole. That is the right scope: how dark a
     contact shadow goes is a look dial, and pinning another lane's feel constant from a WORLD
     suite is exactly the over-reach §141.1 warns about. What is pinned is the STRUCTURE the dial
     relies on — that no other constant can affect darkness, and that the dial still reaches the
     applied uniform. */
  const hues = [0x2a3f66, 0xffffff, 0x804020, 0x101010];
  let checked = 0;
  for (const h of hues) {
    const c = new THREE.Color(h);
    const out = tintMultiplier(c, TUNE, new THREE.Color());
    /* the brightest channel always lands exactly on tintDark, whatever the hue's absolute level */
    agrees(Math.max(out.r, out.g, out.b), TUNE.tintDark, 1e-6, `brightest channel for #${h.toString(16)}`);
    checked++;
  }
  /* Scaling the hue changes nothing: normalisation removes absolute brightness. The two hues are
     built by assigning LINEAR channels directly — halving a hex literal is a halving in sRGB, and
     three's colour management makes that a different ratio once decoded, which is a trap that cost
     this arm one run. */
  const lin = (r, g, b) => { const c = new THREE.Color(); c.r = r; c.g = g; c.b = b; return c; };
  const a = tintMultiplier(lin(0.16, 0.25, 0.40), TUNE, new THREE.Color());
  const b = tintMultiplier(lin(0.08, 0.125, 0.20), TUNE, new THREE.Color());
  console.log(`  P4: linear hue -> (${a.r.toFixed(4)}, ${a.g.toFixed(4)}, ${a.b.toFixed(4)}); the same hue at half `
    + `brightness -> (${b.r.toFixed(4)}, ${b.g.toFixed(4)}, ${b.b.toFixed(4)})`);
  for (const k of ['r', 'g', 'b']) assert.ok(Math.abs(a[k] - b[k]) < 1e-6, `channel ${k} moved when only the hue's brightness did`);
  /* tintSat 0 must give a pure neutral darkening */
  const flat = tintMultiplier(lin(0.16, 0.25, 0.40), { ...TUNE, tintSat: 0 }, new THREE.Color());
  assert.ok(Math.abs(flat.r - flat.g) < 1e-6 && Math.abs(flat.g - flat.b) < 1e-6, 'tintSat 0 is not neutral');
  agrees(flat.r, TUNE.tintDark, 1e-6, 'tintSat 0 darkness');
  assert.ok(checked > 0, 'inspected 0 hues');
});

test('P5: `groundFootprint` measures the base slab, and falls back rather than returning zero', () => {
  /* The fallback branch — "a prop whose lowest slab is a point ... falls back to a third of the
     whole silhouette" — has no caller that can reach it in the shipped level, so it is the kind
     of branch that rots unnoticed. A cone is the shape the comment describes. */
  const box = new THREE.BoxGeometry(2, 1, 4);
  const fp = groundFootprint(box);
  assert.ok(fp, 'a box has no footprint');
  agrees(fp.radius, (2 + 4) / 4, 1e-6, 'a 2x4 box base radius is the mean half-extent');
  agrees(fp.height, 1, 1e-6, 'box height');
  agrees(baseRadiusOf(box), fp.radius, 1e-12, 'baseRadiusOf must agree with groundFootprint');

  /* a cone standing on its tip: the lowest 25 cm is (near) a point */
  const cone = new THREE.ConeGeometry(1, 3, 16);
  cone.rotateX(Math.PI);                                  // tip down
  const cf = groundFootprint(cone);
  assert.ok(cf, 'a tipped cone has no footprint');
  const whole = ((1 * 2) + (1 * 2)) / 4;
  console.log(`  P5: box ${fp.radius.toFixed(4)} · tip-down cone ${cf.radius.toFixed(4)} (whole/3 would be ${(whole / 3).toFixed(4)})`);
  assert.ok(cf.radius > 0, 'the fallback returned a zero radius, which `add()` would then reject');

  /* degenerate input must return null rather than NaN */
  assert.equal(groundFootprint(null), null, 'null input');
  assert.equal(groundFootprint([]), null, 'empty list');
  assert.equal(baseRadiusOf(null), 0, 'baseRadiusOf(null) must be 0, not NaN');
});

/* ================= 2. Decals: the numbers the header states about itself ================= */

test('C1: the header and TUNE arithmetic re-derives', () => {
  /* every one of these is a number the file states about its own constants */
  const [cCore] = claim(DECALS_SRC, /\(0\.66 x 1\.42 = ([\d.]+) of the footprint radius\)/, 'core x spread');
  agrees(TUNE.core * TUNE.spread, cCore, 0.005, 'core x spread');

  const [cSpread, cBarrel, cRing] = claim(DECALS_SRC,
    /At ([\d.]+) the visible ring\s*\n?\s*\*?\s*on a ([\d.]+) m barrel is (\d+) cm/, 'the spread-1.20 worked example');
  agrees(cBarrel * (cSpread - 1) * 100, cRing, 0.2, 'the visible ring at the rejected spread');
  assert.ok(TUNE.spread > cSpread, `TUNE.spread ${TUNE.spread} is no longer above the ${cSpread} the comment rejects`);

  /* the two reach examples, at the sun elevations the same comments name */
  const cot = (deg) => 1 / Math.tan(THREE.MathUtils.degToRad(deg));
  const [cIntDeg, cIntLen] = claim(DECALS_SRC, /`interior` \((\d+) degree sun, shadow length ([\d.]+)\)/, 'interior sun');
  agrees(cot(cIntDeg), cIntLen, 0.005, 'interior shadow length');
  const [cCourtDeg, cCourtLen] = claim(DECALS_SRC, /`courtyard`\s*\n?\s*\*?\s*\((\d+) degrees, ([\d.]+)\)/, 'courtyard sun');
  agrees(cot(cCourtDeg), cCourtLen, 0.005, 'courtyard shadow length');

  const [cReachCm] = claim(DECALS_SRC, /a reach of\s*\n?\s*\*?\s*([\d.]+) cm on a coin stack/, 'the interior coin-stack reach');
  /* coin_stack_medium is 0.641 m tall — the only coin stack whose reach lands on the stated figure */
  agrees(reachFor(0.641, cot(cIntDeg)) * 100, cReachCm, 0.05, 'interior coin-stack reach');

  const [cCrateH, cCast] = claim(DECALS_SRC, /under a ([\d.]+) m crate whose REAL cast shadow is\s*\n?\s*\*?\s*([\d.]+) m long/, 'the crate cast shadow');
  agrees(cCrateH * cot(cCourtDeg), cCast, 0.02, 'the crate cast shadow length');
  assert.equal(reachFor(cCrateH, cot(cCourtDeg)), TUNE.reachCap, 'that crate should be at the reach cap');

  console.log(`  C1: core*spread ${(TUNE.core * TUNE.spread).toFixed(4)} · interior reach `
    + `${(reachFor(0.641, cot(cIntDeg)) * 100).toFixed(2)} cm · crate cast ${(cCrateH * cot(cCourtDeg)).toFixed(3)} m`);
});

test('C2: the "near ~40 % of the cast shadow" claim, under the shader\'s own geometry', () => {
  /* `along = d.x * (r + reach) + reach * push`, so the decal's downwind extent beyond its own
     disc is exactly `reach * (1 + push)`. That is the quantity the claim describes, and it is the
     only reading of five that lands on 40 %. Recorded here because the other four do not, and a
     reader checking this number needs to know which one was meant. */
  const cot = (deg) => 1 / Math.tan(THREE.MathUtils.degToRad(deg));
  const [cPct] = claim(DECALS_SRC, /the near ~(\d+) % of a [\d.]+ m cast shadow/, 'the reach-vs-cast fraction');
  const crateH = 2.142, rBase = 1.0371;                    // measured in §395's KayKit boot
  const sl = cot(26);
  const reach = reachFor(crateH, sl);
  const cast = crateH * sl;
  const beyondDisc = (reach * (1 + TUNE.push)) / cast;
  const readings = {
    'reach / cast': reach / cast,
    'reach*(1+push) / cast': beyondDisc,
    'downwind edge / cast': (reach * TUNE.push + rBase * TUNE.spread + reach) / cast,
  };
  console.log('  C2: ' + Object.entries(readings).map(([k, v]) => `${k} ${(100 * v).toFixed(1)}%`).join(' · '));
  agrees(100 * beyondDisc, cPct, 1.5, 'the decal\'s downwind travel beyond its own disc');
  assert.ok(Math.abs(100 * (reach / cast) - cPct) > 5,
    'the plain reach/cast reading now also lands on the stated figure, so this arm no longer '
    + 'distinguishes which quantity the comment meant');
});

test('C3: the px table is 900p at each shot\'s nearest prop — and one entry is inherited stale', () => {
  /* "4.5 cm subtends 12.57 px at sly-closeup, 5.02 at interior, 3.43 at hero, 2.48 at temple and
     1.11 px at courtyard." Solving each for its distance at 1600x900 (`tools/shot.mjs`'s default)
     gives 4.68 / 8.27 / 13.91 / 15.69 / 35.04 m — every one within a few percent of that shot's
     nearest KayKit prop, which is the basis. The arm pins the arithmetic, not the distances,
     because the placement table has moved under them since. */
  const px = Object.fromEntries([...DECALS_SRC.matchAll(/([\d.]+) px at `([a-z-]+)`/g)].map((m) => [m[2], +m[1]]));
  const inline = /subtends ([\d.]+) px at `([a-z-]+)`, ([\d.]+) px at `([a-z-]+)`, ([\d.]+) px\s*\n?\s*\*?\s*at `([a-z-]+)`, ([\d.]+) px at `([a-z-]+)`/.exec(DECALS_SRC);
  assert.ok(inline || Object.keys(px).length >= 2, 'the px table is no longer parseable from the header');
  const H = 900;
  const rows = [];
  for (const [shot, claimed] of Object.entries(px)) {
    if (!SHOTS[shot]) continue;
    const tan = Math.tan(THREE.MathUtils.degToRad(SHOTS[shot].fov / 2));
    rows.push({ shot, claimed, d: (0.045 * H) / (2 * claimed * tan) });
  }
  console.log('  C3: ' + rows.map((r) => `${r.shot} ${r.claimed}px -> ${r.d.toFixed(2)} m`).join(' · '));
  assert.ok(rows.length >= 2, `parsed only ${rows.length} px claims from the header`);
  for (const r of rows) {
    assert.ok(r.d > 1 && r.d < 120, `${r.shot}'s ${r.claimed} px implies ${r.d.toFixed(1)} m, which is not a plausible prop distance`);
    /* and each must invert: the stated px is what 4.5 cm subtends at that distance */
    const back = (0.045 * H) / (2 * r.d * Math.tan(THREE.MathUtils.degToRad(SHOTS[r.shot].fov / 2)));
    agrees(back, r.claimed, 0.01, `${r.shot} px round-trip`);
  }
  /* `courtyard` is the one the rest of the file leans on, and it derives from the 35 m that is
     the near end of the "35-51 m" band §395.3 corrected in KayKit.js and did NOT correct here. */
  const court = rows.find((r) => r.shot === 'courtyard');
  assert.ok(court, 'the courtyard px figure is gone from the header');
  agrees(court.d, 35.0, 0.1, 'the courtyard px figure derives from a 35 m prop distance');
  assert.match(DECALS_SRC, /35[–-]51 m/,
    'the "35-51 m" band has been corrected here — if so, the 1.11 px figure derived from its near '
    + 'end needs re-deriving with it, and this arm needs rewriting');
});

/* ============================ 3. Statues ============================ */

test('T1: all seven statue builders are pure, deterministic and DOM-free', () => {
  const S = STATUES;
  const names = ['seatedColossus', 'sphinx', 'anubis', 'falconRa', 'coffinLid', 'fallenHead', 'brokenStatue'];
  const rows = [];
  for (const n of names) {
    assert.equal(typeof S[n], 'function', `${n} is not exported as a function`);
    const build = () => {
      const bag = S[n]({ rng: rng(0x1234) });
      const bb = new THREE.Box3();
      let tris = 0;
      for (const p of bag.parts) {
        p.geo.computeBoundingBox(); bb.union(p.geo.boundingBox);
        tris += (p.geo.index ? p.geo.index.count : p.geo.attributes.position.count) / 3;
      }
      return { bb, tris, parts: bag.parts.length };
    };
    const a = build(), b = build();
    const s = new THREE.Vector3(); a.bb.getSize(s);
    rows.push(`${n} ${a.tris}t`);
    assert.ok(a.parts > 0, `${n} produced no parts`);
    assert.equal(a.tris, b.tris, `${n} is not deterministic under the same seed`);
    assert.ok(a.bb.min.distanceTo(b.bb.min) < 1e-9 && a.bb.max.distanceTo(b.bb.max) < 1e-9,
      `${n} produced different bounds from the same seed`);
    assert.ok(s.x > 0 && s.y > 0 && s.z > 0 && [s.x, s.y, s.z].every(Number.isFinite), `${n} has degenerate bounds`);
  }
  console.log(`  T1: ${rows.join(' · ')} · document=${typeof document}`);
  assert.equal(typeof document, 'undefined', 'a DOM appeared, so this is not the headless path');
});

test('T2: the heights the two files quote at each other', () => {
  /* `Statues.js` calls it "The 13 m seated colossus" and, elsewhere, "a 3.5 m sphinx and a 13 m
     colossus". Measured through Props: the colossus figure is 11.33 m tall and its top sits at
     world 13.32 m, because local y = 0 is the plinth top at world 2.0. So "13 m" is a WORLD
     height and "3.5 m" is a BUILDER height — two bases in one sentence. */
  assert.equal(COLOSSI.length, 2, 'the courtyard should hold two colossi');
  const [cWorld] = claim(STATUES_SRC, /The (\d+) m seated colossus/, 'the colossus height');
  const [cPlinth] = claim(STATUES_SRC, /Local y = 0 is the plinth top \(world y = ([\d.]+)\)/, 'the plinth top');
  for (const c of COLOSSI) {
    const s = new THREE.Vector3(); c.bb.getSize(s);
    console.log(`  T2: colossus figure ${s.y.toFixed(3)} m tall, world y ${c.bb.min.y.toFixed(2)}..${c.bb.max.y.toFixed(2)}`);
    agrees(c.bb.min.y, cPlinth, 0.02, 'the figure stands on the stated plinth top');
    agrees(c.bb.max.y, cWorld, 0.4, 'the colossus top against its stated height');
    assert.ok(Math.abs(s.y - cWorld) > 1,
      'the FIGURE is now as tall as the stated height, so the world/builder distinction this arm '
      + 'records has gone away and the comment is unambiguous again');
  }
});

test('T3: the avenue is uniform BY DESIGN — measured, and not the rope-coil defect', () => {
  /* The clone-family question, asked of sixteen sphinxes standing in two rows. The answer is that
     they are near-identical and that this is correct: a processional avenue is supposed to match,
     and `Props.js` spends its irregularity budget on one toppled head rather than on size
     variation ("eight perfect pairs reads as a copy-paste"). So `basketvary`'s CV >= 0.12 bar is
     NOT applied here — it would be the wrong bar for the wrong object.
     What IS checked is the bar that does transfer: no camera sees more than two identical
     silhouettes, which is `basketvary` A1 exactly. */
  assert.ok(SPHINX.length > 0, 'inspected 0 sphinxes');
  assert.equal(SPHINX.length, 16, 'eight rows, two sides');
  assert.equal(FALLEN.length, 1, 'the one toppled head that pays for the uniformity');
  assert.equal(new Set(SPHINX.map((b) => b.tris)).size, 1, 'the sphinxes should share one triangle count');

  const S5 = (v) => Math.round(v / 0.05);
  const sig = (b) => { const s = new THREE.Vector3(); b.bb.getSize(s); return `${S5(s.x)}x${S5(s.y)}x${S5(s.z)}`; };
  const sigs = new Set(SPHINX.map(sig));
  const diag = SPHINX.map((b) => { const s = new THREE.Vector3(); b.bb.getSize(s); return s.length(); });
  const mean = diag.reduce((a, c) => a + c, 0) / diag.length;
  const cv = Math.sqrt(diag.reduce((a, c) => a + (c - mean) ** 2, 0) / diag.length) / mean;
  console.log(`  T3: ${SPHINX.length} sphinxes, ${sigs.size} distinct silhouettes at 5 cm, bbox-diagonal CV ${cv.toFixed(4)}`);
  assert.ok(cv < 0.12, `the avenue's CV is now ${cv.toFixed(4)} — it has stopped being a matched row, which `
    + 'is a design change rather than a fix');
  assert.ok(sigs.size >= 8, `only ${sigs.size} distinct silhouettes — the placement jitter that produces them may be gone`);

  /* basketvary A1, transferred: worst identical-silhouette count in any canonical frame */
  let worst = 0, worstShot = '';
  for (const [name, s] of Object.entries(SHOTS)) {
    const cam = camOf(s);
    const f = new THREE.Frustum().setFromProjectionMatrix(
      new THREE.Matrix4().multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse));
    const counts = {};
    for (const b of SPHINX) if (f.intersectsBox(b.bb)) counts[sig(b)] = (counts[sig(b)] || 0) + 1;
    const w = Math.max(0, ...Object.values(counts));
    if (w > worst) { worst = w; worstShot = name; }
  }
  console.log(`  T3: worst frame is "${worstShot}" with ${worst} identical silhouettes (basketvary A1 bar is 2)`);
  assert.ok(worst <= 2, `${worstShot} sees ${worst} sphinxes of one silhouette; basketvary's bar for the same defect is 2`);
});

test('T3 CALIBRATION: the isolated-builder measurement that would have called this a clone family', () => {
  /* MUST FIRE, and it is a calibration of the METHOD rather than of a bar. Calling the builder
     directly — no `Props`, no placement jitter — collapses the avenue to one silhouette. That is
     the measurement this round nearly published, and this arm exists so the difference between
     "measured the module" and "measured the shipped level" stays visible in the suite. */
  const S = STATUES;
  const S5 = (v) => Math.round(v / 0.05);
  const isolated = [];
  for (let i = 0; i < 8; i++) {
    const bag = S.sphinx({ rng: rng(0x900 + i), worn: 0.35 + i * 0.05 });
    const bb = new THREE.Box3();
    for (const p of bag.parts) { p.geo.computeBoundingBox(); bb.union(p.geo.boundingBox); }
    const s = new THREE.Vector3(); bb.getSize(s);
    isolated.push(`${S5(s.x)}x${S5(s.y)}x${S5(s.z)}`);
  }
  const isoDistinct = new Set(isolated).size;
  const S5b = (v) => Math.round(v / 0.05);
  const shipped = new Set(SPHINX.map((b) => { const s = new THREE.Vector3(); b.bb.getSize(s); return `${S5b(s.x)}x${S5b(s.y)}x${S5b(s.z)}`; })).size;
  console.log(`  T3 calib: builders called in isolation give ${isoDistinct} distinct silhouettes of 8; `
    + `the shipped avenue gives ${shipped} of ${SPHINX.length}`);
  assert.equal(isoDistinct, 1,
    'the isolated builders no longer collapse to one silhouette, so the trap this arm records is gone '
    + 'and the docblock about it needs rewriting');
  assert.ok(shipped > isoDistinct * 4,
    'the shipped avenue and the isolated builders now agree, so booting Props buys nothing here — '
    + 'which would make this whole arm pointless and is worth knowing');
});

test('T4: the two colossi are differentiated, and by the collar the comment names', () => {
  /* "`collarSpan`/`collarRows` exist so the two courtyard colossi can differ ... when both figures
     carry the identical one the pair reads as matched — measured as the dominant mirror tell in
     `courtyard`." Props builds them with collarRows 5 and 4. */
  assert.equal(COLOSSI.length, 2, 'inspected the wrong number of colossi');
  const [w, e] = COLOSSI;
  console.log(`  T4: west ${w.parts} parts / ${w.tris} tris · east ${e.parts} parts / ${e.tris} tris · delta ${w.tris - e.tris}`);
  assert.notEqual(w.tris, e.tris,
    'the two colossi are now triangle-identical — the collar differentiation that closed the '
    + '`courtyard` mirror-tell defect has been lost');
  assert.equal(w.parts - e.parts, 1, 'the differentiation should be exactly one collar row');
  /* and they are still a matched PAIR in everything else: same height, mirrored across x */
  const ws = new THREE.Vector3(), es = new THREE.Vector3();
  w.bb.getSize(ws); e.bb.getSize(es);
  assert.ok(Math.abs(ws.y - es.y) < 0.05, 'the pair no longer reads as matched in height');
  const wc = w.bb.getCenter(new THREE.Vector3()), ec = e.bb.getCenter(new THREE.Vector3());
  assert.ok(Math.abs(wc.x + ec.x) < 0.5, `the colossi are not mirrored about x=0 (${wc.x.toFixed(2)}, ${ec.x.toFixed(2)})`);
  assert.ok(Math.abs(wc.z - ec.z) < 0.1, 'the colossi are no longer at the same z');
});

/* ==================== 4. ContactDecals, through both of its users ==================== */

test('D1: ContactDecals is driven by two modules and reports what it applied', () => {
  /* `Props` and `KayKit` each own an instance. This arm is about the shared class rather than
     either caller: the queue count, the state() readback, and the tint that `P4` proved is
     independent of hue brightness. */
  const st = P.decalState();
  assert.ok(st, 'Props publishes no decal state');
  console.log(`  D1: props decals ${P.decals.count} · state ${JSON.stringify({ count: st.count, strength: st.strength, reachCap: st.reachCap })}`);
  assert.ok(P.decals.count > 0, 'inspected 0 decals');
  assert.equal(st.count, P.decals.count, 'state() disagrees with the queue');
  assert.equal(st.strength, TUNE.strength, 'state() must report the tune that applied');
  assert.equal(st.reachFrac, TUNE.reachFrac, 'state() reachFrac');
  assert.equal(st.reachCap, TUNE.reachCap, 'state() reachCap');
  assert.equal(st.push, TUNE.push, 'state() push');
  /* the blue channel of the shadow-hue multiplier lands exactly on tintDark, because §2.2's
     shadow hue is blue-dominant and `tintMultiplier` normalises by the brightest channel */
  agrees(Math.max(st.tintR, st.tintG, st.tintB), TUNE.tintDark, 1e-6, 'the applied tint\'s brightest channel');
  assert.ok(st.tintR < st.tintB && st.tintG < st.tintB, 'the contact no longer darkens toward a blue shadow hue');
});

test('D2: `add()` refuses the inputs that would put a NaN in a vertex buffer', () => {
  /* `add` is the only public way into the batch and it is the last place a bad number can be
     stopped — everything after it is a Float32Array feeding a shader. */
  const { ContactDecals } = { ContactDecals: P.decals.constructor };
  const d = new ContactDecals({ get: () => null }, { name: 'test' });
  let accepted = 0, refused = 0;
  const cases = [
    [[0, 0, 0, 1, 1], true], [[5, -2, 3, 0.5, 2], true],
    [[NaN, 0, 0, 1, 1], false], [[0, NaN, 0, 1, 1], false], [[0, 0, NaN, 1, 1], false],
    [[0, 0, 0, NaN, 1], false], [[0, 0, 0, 1, NaN], false],
    [[Infinity, 0, 0, 1, 1], false], [[0, 0, 0, 0, 1], false], [[0, 0, 0, -1, 1], false],
  ];
  for (const [args, want] of cases) {
    const got = d.add(...args);
    assert.equal(got, want, `add(${args.join(', ')}) returned ${got}`);
    if (got) accepted++; else refused++;
  }
  console.log(`  D2: ${accepted} accepted, ${refused} refused; queue holds ${d.count}`);
  assert.ok(refused > 0 && accepted > 0, 'the case table did not exercise both outcomes');
  assert.equal(d.count, accepted, 'a refused decal still reached the queue');
  /* a negative height is clamped rather than refused — it cannot produce upwind reach */
  assert.equal(d.add(0, 0, 0, 1, -5), true, 'a negative height should be clamped, not refused');
  assert.equal(reachFor(-5, 2), 0, 'and it must produce zero reach');
});

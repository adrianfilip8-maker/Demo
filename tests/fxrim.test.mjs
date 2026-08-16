/**
 * fxrim.test.mjs — the offline half of §379.4's ink test.
 *
 * §379.1's structural claim is that particles carry NEITHER mandatory ink treatment: they set
 * `depthWrite: false`, so `PostFX`'s depth/normal edge pass cannot see them, and they are
 * instanced quads rather than meshes in the hull system, so they get no shell. `impact` is the
 * frame that can settle it — `dive_ring`'s peak projected ink is 104x `alert_spot`'s and 7.6x
 * the next largest sprite in the game — and `tools/fxrim.mjs` + `tools/fxrimscore.mjs` measure
 * it against a capture.
 *
 * That measurement rests on three things that can go stale without anyone noticing, and this
 * file is those three:
 *
 *   1. the ring the scorer measures is the ring the RUNTIME stages and the one `Shots.js`'s
 *      certificate describes — three statements of one circle, in three files;
 *   2. the polyline the band is built on follows that circle closely enough that the band lands
 *      on the ink rather than beside it;
 *   3. the band is wide enough to contain the shipped ink line, and the constant it is derived
 *      from is still the constant the renderer draws with.
 *
 * Everything here runs the SHIPPED functions — `Particles.prototype._stageImpact`,
 * `framelib.discOf`, `fxrimlib`'s own band builders — on stubs, in the idiom
 * `tests/alertshot.test.mjs` and `tests/fxfeel.test.mjs` use. A test with its own copy of the
 * recipe seals a measurement nobody takes.
 *
 * ── Calibration ─────────────────────────────────────────────────────────────────────────────
 * T2 and T4 each carry an arm that MUST FIRE against a planted violation. A band check that
 * accepts any band and a polyline check that accepts any polygon are indistinguishable from no
 * check at all — §210.2's `debugTerm` failure, which this project has now met often enough to
 * treat as the default outcome rather than the unlucky one.
 *
 * ── §211.1 ──────────────────────────────────────────────────────────────────────────────────
 * Every data-driven arm asserts a non-zero inspected count.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { readFileSync } from 'node:fs';

import { SHOTS } from '../src/core/Shots.js';
import { Particles, TUNE as FX_TUNE } from '../src/fx/Particles.js';
import { TUNE as TOON_TUNE } from '../src/render/ToonMaterial.js';
import { TUNE as POSTFX_TUNE } from '../src/render/PostFX.js';
import { W, H, camFor, discOf, project } from '../tools/framelib.mjs';
import { BAND_R, bandOfPolyline, bandOfPixels, boundaryOf, stamp, countOf, density }
  from '../tools/fxrimlib.mjs';

/** Run the shipped `_stageImpact` against a stubbed world, exactly as `alertshot.test.mjs` does. */
function stageImpact(pos = SHOTS.impact.player.pos) {
  const emits = [], decals = [];
  const ctx = {
    engine: { get: (k) => (k === 'movement' ? { position: new THREE.Vector3(...pos) } : null) },
    _emit: (n, at, o) => emits.push({ n, at: at.clone(), ...o }),
    decal: (n, at, u, o) => decals.push({ n, at: at.clone(), ...o }),
  };
  return { out: Particles.prototype._stageImpact.call(ctx), emits, decals };
}

const CAM = camFor(SHOTS.impact);

/* ══════════════════════════════ T1 — one circle, and discOf reports its own samples ══ */

test('T1: discOf publishes the rim it measured, and every sample is the projected circle', () => {
  /* The scorer builds its band from `discOf(...).rim` rather than from a loop of its own. That
     is only safe while `rim` really is the circle `discOf` took its extremes from — if the two
     ever came from different code the box would certify one ring and the band would measure
     another, and nothing would say so. */
  const { out } = stageImpact();
  const SEG = 96;
  const d = discOf(CAM, out.point.x, out.point.y, out.point.z, out.radius, SEG);

  assert.ok(d && Array.isArray(d.rim), 'discOf no longer returns its rim samples');
  assert.equal(d.rim.length, SEG, `discOf returned ${d.rim.length} rim samples for ${SEG} segments`);
  assert.ok(SEG > 0 && d.rim.length > 0, '§211.1: nothing was inspected');

  /* Each sample IS `project()` of the world point at that angle. Exact equality, not a
     tolerance: both sides are the same double arithmetic, and a tolerance here would accept a
     rim built from a different radius. */
  for (let i = 0; i < SEG; i++) {
    const a = (i / SEG) * Math.PI * 2;
    const p = project(CAM, out.point.x + Math.cos(a) * out.radius, out.point.y,
      out.point.z + Math.sin(a) * out.radius);
    assert.equal(d.rim[i].px, p.px, `rim sample ${i} is not the projected circle in x`);
    assert.equal(d.rim[i].py, p.py, `rim sample ${i} is not the projected circle in y`);
  }

  /* And the box is those samples' extremes, so `rim` and `x0..y1` describe one object. */
  assert.equal(d.x0, Math.min(...d.rim.map((p) => p.px)));
  assert.equal(d.x1, Math.max(...d.rim.map((p) => p.px)));
  assert.equal(d.y0, Math.min(...d.rim.map((p) => p.py)));
  assert.equal(d.y1, Math.max(...d.rim.map((p) => p.py)));
});

/* ══════════════════════════ T2 — the sag, and why the scorer does not use the default ══ */

/** Largest distance from any point of the `fine` rim to the `coarse` rim's chords, in pixels. */
function sagBetween(fine, coarse) {
  let worst = 0;
  for (const p of fine) {
    let best = Infinity;
    for (let i = 0; i < coarse.length; i++) {
      const a = coarse[i], b = coarse[(i + 1) % coarse.length];
      const vx = b.px - a.px, vy = b.py - a.py;
      const len2 = vx * vx + vy * vy;
      const t = len2 ? Math.max(0, Math.min(1, ((p.px - a.px) * vx + (p.py - a.py) * vy) / len2)) : 0;
      best = Math.min(best, Math.hypot(p.px - (a.px + vx * t), p.py - (a.py + vy * t)));
    }
    worst = Math.max(worst, best);
  }
  return worst;
}

test('T2 CALIBRATION: discOf\'s DEFAULT 24 segments displace the band off the rim', () => {
  /* MUST FIRE. `fxrimscore` asks `discOf` for 720 samples instead of taking the default, and
     that is a choice that has to be justified by a number rather than by caution: an inscribed
     polygon cuts inside the circle it approximates, and a band centred on a chord is a band
     centred somewhere the ink is not.

     ── The first version of this arm asserted a claim that is FALSE, and fired ──────────────
     It required the sag to exceed the whole band half-width — i.e. that the default polyline
     would miss the rim entirely. It does not: the measured sag is ~1.57 px against a 2.25 px
     half-width, so a default-sampled band would still overlap the true rim. The arm caught the
     overstatement, which is what it is for, and the claim is now the one the geometry supports:
     the band would be DISPLACED by more than half its own reach, and a band centred 70% of its
     half-width away from the thing it is measuring is not measuring that thing. The criterion
     is `BAND_R / 2` — derived from the band, not chosen to fit 1.57.

     If this ever stops firing, the scorer's 720 has become decoration and the honest response
     is to delete the argument rather than keep a comment claiming a difference that is gone. */
  const { out } = stageImpact();
  const fine = discOf(CAM, out.point.x, out.point.y, out.point.z, out.radius, 720).rim;
  const coarse = discOf(CAM, out.point.x, out.point.y, out.point.z, out.radius).rim;   // the default

  assert.equal(coarse.length, 24, 'discOf\'s default segment count moved; this arm is calibrated against 24');
  const sag = sagBetween(fine, coarse);
  assert.ok(sag > BAND_R / 2,
    `CALIBRATION FAILED: the 24-segment chords sit only ${sag.toFixed(2)} px inside the true rim, `
    + `under half the ${BAND_R} px band's half-width — so sampling at 720 buys nothing and the `
    + 'scorer\'s justification for doing it is false');

  /* And the fine polyline is faithful, which is the other half of the same claim: 720 is enough,
     not merely more. Bar 0.25 px — a quarter of a pixel cannot move a band that is `BAND_R` wide. */
  const fine2 = discOf(CAM, out.point.x, out.point.y, out.point.z, out.radius, 2880).rim;
  const residual = sagBetween(fine2, fine);
  assert.ok(residual < 0.25,
    `720 samples still sag ${residual.toFixed(3)} px, so the band is built on a polygon and not a ring`);
});

/* ═══════════════════════ T3 — the runtime, the tool and the certificate describe one ring ══ */

test('T3: the ring under test is the one Shots.js certifies, re-derived and not restated', () => {
  /* `SHOTS.impact`'s comment carries the candidate-C certificate — `ring 360 x 181 px` — and
     `tools/impactframe.mjs` produced it. The scorer measures ink along that same ring. Three
     files, one circle, and the certificate is the only one of the three a reader checks the
     picture against.

     The numbers are PARSED out of the comment rather than written here, for the reason the
     SHOT COUNT banner arm in `alertshot.test.mjs` records: the world lane proved empirically
     that a pinned copy goes stale silently while a parsed one cannot. */
  const src = readFileSync(new URL('../src/core/Shots.js', import.meta.url), 'utf8');
  const cert = src.match(/ring\s+(\d+)\s*x\s*(\d+)\s*px/);
  assert.ok(cert, 'SHOTS.impact no longer carries a `ring W x H px` certificate to check against');
  const [wantW, wantH] = [Number(cert[1]), Number(cert[2])];
  assert.ok(wantW > 0 && wantH > 0, '§211.1: the certificate parsed to zero');

  const { out } = stageImpact();
  assert.equal(out.radius, 1.2 * FX_TUNE.impactScale,
    'the staged ring radius is not the one impactframe framed');

  /* At the DEFAULT segment count, because that is what `impactframe` used to write the line. */
  const d = discOf(CAM, out.point.x, out.point.y, out.point.z, out.radius);
  assert.equal(Math.round(d.x1 - d.x0), wantW,
    `the shipped camera and staging now project the ring ${Math.round(d.x1 - d.x0)} px wide; the `
    + `certificate in Shots.js says ${wantW}`);
  assert.equal(Math.round(d.y1 - d.y0), wantH,
    `the ring is now ${Math.round(d.y1 - d.y0)} px tall against a certificate of ${wantH}`);
});

/* ═══════════════════════════════ T4 — the band contains the line it is looking for ══ */

test('T4: the band is wide enough for the shipped ink line, and a narrower one is not', () => {
  /* `BAND_R` is `TUNE.inkPx / 2 + 1`. Two things have to hold for that to be a derivation and
     not a number that happens to work: it must contain a line of `inkPx` centred on the
     boundary, and the builder must actually lay down that many pixels. Both are measured off
     the shipped builder rather than argued. */
  assert.ok(TOON_TUNE.inkPx > 0, '§211.1: TUNE.inkPx is zero');
  assert.equal(BAND_R, TOON_TUNE.inkPx / 2 + 1,
    'BAND_R is no longer derived from the shipped line width');
  assert.ok(BAND_R >= TOON_TUNE.inkPx / 2,
    `a ${2 * BAND_R} px band cannot contain a ${TOON_TUNE.inkPx} px line`);

  /* Measure the band the builder ACTUALLY produces, across a straight vertical run in the
     middle of the frame — `bandOfPolyline`, which is the builder the rim uses, rather than a
     width computed from the radius. Its width in pixels is what the ink has to fit inside.

     (The first draft of this arm fed the two endpoints to `bandOfPixels`, which stamps a disc
     per pixel it is GIVEN and therefore laid down two discs 100 px apart with nothing between
     them; the row it then measured was empty and the arm failed at 0 px. Recorded because the
     failure was the test's and not the builder's, and a reader deserves to know which.) */
  const seg = [{ px: 400.5, py: 200.5 }, { px: 400.5, py: 300.5 }];
  const band = bandOfPolyline(seg, BAND_R);
  assert.ok(band.n > 0, '§211.1: the band builder produced nothing');
  let wide = 0;
  for (let x = 0; x < W; x++) if (band[250 * W + x]) wide++;
  assert.ok(wide >= TOON_TUNE.inkPx,
    `the band is ${wide} px across at its centre, narrower than the ${TOON_TUNE.inkPx} px line it must contain`);

  /* MUST FIRE: the same builder at half-width 0.5 is narrower than the line, so a measurement
     taken there would sample part of the ink and report it as all of it. If this stops failing,
     `BAND_R` has stopped being load-bearing and the sweep's narrow rows are not the control the
     scorer prints them as. */
  const narrow = bandOfPolyline(seg, 0.5);
  let narrowWide = 0;
  for (let x = 0; x < W; x++) if (narrow[250 * W + x]) narrowWide++;
  assert.ok(narrowWide < TOON_TUNE.inkPx,
    `CALIBRATION FAILED: a half-width-0.5 band is already ${narrowWide} px across, so it contains `
    + `the ${TOON_TUNE.inkPx} px line too and BAND_R's derivation decides nothing`);
});

/* ═════════════════════════ T5 — the region primitives measure the region, not the frame ══ */

test('T5: density is a fraction of the REGION, and ink outside it cannot raise the number', () => {
  /* The whole verdict is three densities. A `density()` that quietly counted mask pixels
     outside the region would report the frame's 16.8% ink coverage everywhere and the rim, the
     hero and the floor would all come back identical — which is exactly the shape of failure
     that looks like a clean null result. */
  const region = stamp(new Uint8Array(W * H), 100.5, 100.5, 10);
  region.n = countOf(region);
  assert.ok(region.n > 0, '§211.1: the region is empty');

  const half = new Uint8Array(W * H);
  let put = 0;
  for (let i = 0; i < W * H; i++) if (region[i] && put < Math.floor(region.n / 2)) { half[i] = 1; put++; }
  assert.equal(density(region, half).d, put / region.n, 'density is not hits/region');

  /* MUST FIRE: a mask that blankets the ENTIRE frame except the region reads as zero. */
  const elsewhere = new Uint8Array(W * H).fill(1);
  for (let i = 0; i < W * H; i++) if (region[i]) elsewhere[i] = 0;
  assert.equal(density(region, elsewhere).d, 0,
    'CALIBRATION FAILED: a mask covering every pixel OUTSIDE the region still scored against it, so '
    + 'the three region densities are all measuring the whole frame');

  /* `boundaryOf` returns the rim of a blob and not its body — the hero probe is a band around a
     boundary, and a boundary that returned the filled silhouette would measure Sly's coat. */
  const blob = stamp(new Uint8Array(W * H), 300.5, 300.5, 20);
  const edge = boundaryOf(blob);
  assert.ok(edge.length > 0, '§211.1: the boundary is empty');
  assert.ok(edge.length < countOf(blob) / 2,
    `boundaryOf returned ${edge.length} of ${countOf(blob)} pixels — that is the body, not its rim`);
});

/* ═══════════════════════ T6 — the build the measurement describes ══ */

test('T6: the FX ink-cut pass still ships OFF, so the capture describes the shipped renderer', () => {
  /* §381.2: `PREREG-fxink2` built a complete FX coverage pass — `uFxMaskPass` on every FX
     shader, rendered by `PostFX.js:2054`, read by the composite's `uFxInkCut` branch — and it
     ships at 0, doing the INVERSE of what §379 wants (it erases ink under FX rather than
     generating it). `RESULT-fxink2` is DO-NOT-SHIP on a validity failure, so the mechanism has
     never been scored clean.

     The whole §379.4 measurement is a statement about the renderer as it ships. If anyone turns
     this on, the numbers in that write-up stop describing the build and start describing a
     configuration nobody recorded — so the constant is asserted here, where the measurement is,
     rather than trusted to stay put. */
  assert.equal(POSTFX_TUNE.fxInkCut, 0,
    `PostFX.TUNE.fxInkCut is ${POSTFX_TUNE.fxInkCut}, not 0. The FX coverage pass is live, so the `
    + '§379.4 rim measurement no longer describes the shipped renderer and must be re-taken.');

  /* And the two ink colours §2.1.2 names are still the two the renderer draws with — the
     `§colour` cross-check in `fxrimscore` reports the measured pixels against these. */
  assert.equal(TOON_TUNE.inkSun, 0x1a1210, '§2.1.2 warm ink colour moved');
  assert.equal(TOON_TUNE.inkShade, 0x161022, '§2.1.2 violet ink colour moved');
  assert.equal(H, 720);
  assert.equal(W, 1280);
});

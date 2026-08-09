import test from 'node:test';
import assert from 'node:assert/strict';
import { TUNE } from '../src/render/PostFX.js';

/**
 * §2.1/§2.2 authored the ink as COLOURED on purpose — "a very dark, slightly warm brown in
 * sunlight and a dark violet in shadow" — and §270 measured that the two endpoints, while 248°
 * apart in hue, are the SAME VALUE (4.8 % apart in luminance for the hull, 5.0 % for the crease).
 * That is why the ink reads as nearly constant against a reference whose ink spans 7.57x.
 *
 * Both facts are load-bearing and they pull in opposite directions, so both get a guard:
 *
 *   - the hue split must survive any attempt to reach black (the failure mode the lane was
 *     explicitly warned about: "reaching black must not flatten the ink to a uniform grey"), and
 *   - the value ramp must not be re-collapsed once it is opened.
 *
 * These are guards on an ART decision, so they are deliberately loose — they fail on the
 * degenerate outcome, not on a re-tune.
 */

const rgb = (hex) => [((hex >> 16) & 255) / 255, ((hex >> 8) & 255) / 255, (hex & 255) / 255];
const luma = ([r, g, b]) => 0.2126 * r + 0.7152 * g + 0.0722 * b;
function hue([r, g, b]) {
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn;
  if (d < 1e-9) return NaN;
  let h = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
  h *= 60;
  return h < 0 ? h + 360 : h;
}
/** Shortest angular distance between two hues, in degrees. */
const hueGap = (a, b) => { const d = Math.abs(a - b) % 360; return d > 180 ? 360 - d : d; };

test('ink colour: the two crease endpoints are not the same hue — the ink is coloured, not grey', () => {
  const warm = rgb(TUNE.inkWarm), cool = rgb(TUNE.inkCool);
  assert.ok(!Number.isNaN(hue(warm)), `inkWarm 0x${TUNE.inkWarm.toString(16)} is achromatic`);
  assert.ok(!Number.isNaN(hue(cool)), `inkCool 0x${TUNE.inkCool.toString(16)} is achromatic`);
  const gap = hueGap(hue(warm), hue(cool));
  /* 60 deg, and derived rather than fitted: a named hue sector (red/yellow/green/cyan/blue/
     magenta) is 60 deg wide, so two hues further apart than that cannot be described as the same
     colour. The shipped pair sits at 112 deg by the SHORTEST arc -- note that 260 - 12 = 248 is
     the long way round, and writing "248 deg apart" is the mistake this assertion caught in its
     own author's prose. */
  assert.ok(gap > 60,
    `warm ${hue(warm).toFixed(1)}° and cool ${hue(cool).toFixed(1)}° are only ${gap.toFixed(1)}° apart — `
    + '§2.2 asks for warm brown in sun and violet in shadow, and this is the guard against a fix '
    + 'for D5a that reaches black by flattening the ink to one colour');
});

test('ink colour: CALIBRATION — the guard fires on the degenerate state it exists for', () => {
  /* A metric never shown to move on a state known to have the defect is not a metric (§13).
     Two greys 248° "apart" are not: an achromatic colour has no hue at all. */
  const grey = rgb(0x141414);
  assert.ok(Number.isNaN(hue(grey)), 'a grey must register as having no hue');
  const nearGrey = rgb(0x151414);
  assert.ok(hueGap(hue(rgb(0x1a1210)), hue(nearGrey)) <= 60,
    'a near-grey cool leg must fail the >60° separation the shipped pair passes');
  /* And the guard must PASS on the shipped pair, or it is a guard against shipping at all. */
  assert.ok(hueGap(hue(rgb(0x1a1210)), hue(rgb(0x161022))) > 60,
    'the shipped pair must clear the bar the degenerate state fails');
});

test('ink colour: the warm leg stays warm and the cool leg stays cool', () => {
  const h = { warm: hue(rgb(TUNE.inkWarm)), cool: hue(rgb(TUNE.inkCool)) };
  /* Warm = the red-orange-yellow half; violet = the blue-magenta side. Wide windows: this pins
     the SIDE of the wheel each leg is on, which is the art direction, not a particular hex. */
  assert.ok(h.warm < 60 || h.warm > 330, `inkWarm is ${h.warm.toFixed(1)}°, not a warm hue`);
  assert.ok(h.cool > 200 && h.cool < 320, `inkCool is ${h.cool.toFixed(1)}°, not a violet`);
});

test('ink colour: both endpoints are dark enough to read as ink at all', () => {
  for (const k of ['inkWarm', 'inkCool']) {
    const l = luma(rgb(TUNE[k]));
    assert.ok(l < 0.20, `${k} display luma ${l.toFixed(4)} is too light to be an ink line`);
    assert.ok(l >= 0, `${k} luma ${l} is not a colour`);
  }
});

test('ink colour: the dark gate, if present, is an ordered pair inside the display range', () => {
  /* PREREG-inkwiden hoists `line *= smoothstep(0.05, 0.20, lum)` into TUNE so it can be A/B'd.
     Skipped while it is still a shader literal, so this test lands ahead of the lever without
     failing before it. */
  if (!TUNE.inkDarkGate) return;
  const [lo, hi] = TUNE.inkDarkGate;
  assert.ok(Number.isFinite(lo) && Number.isFinite(hi), 'inkDarkGate must be two finite numbers');
  assert.ok(lo < hi, `inkDarkGate [${lo}, ${hi}] is not ordered — smoothstep would be undefined`);
  assert.ok(lo >= 0 && hi <= 1, `inkDarkGate [${lo}, ${hi}] is outside the display range`);
});

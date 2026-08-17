import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { FpsMeter } from '../src/core/Engine.js';

/**
 * The frame-rate readout, and the input it could never report.
 *
 * `Engine.renderFrame` used to compute the on-screen fps from the SIMULATION delta:
 *
 *     this._fpsAccum += this.dt || 1 / 60;          // dt = min(raw, 1/20) * timeScale
 *     this.stats.fps = Math.round(this._fpsFrames / this._fpsAccum);
 *
 * `dt` is clamped to 1/20 s, so on any machine slower than 20 fps every frame contributes
 * exactly 1/20 and the quotient is exactly 20. The readout `src/core/Debug.js:320` prints was
 * therefore **incapable of reporting a slow machine** — the defect class §418 is about, sitting
 * in the one number a playtester looks at to answer "is this running well".
 *
 * It was found by measurement, not by reading: a driven play session in this container presented
 * **38 frames in 53.9 s — 0.70 fps — while every sample of `stats.fps` read 21.**
 *
 * `FpsMeter` accumulates wall time instead. These arms exist to show that the new law has the
 * answer the old one could not produce.
 */

const SRC = new URL('../src/core/Engine.js', import.meta.url).pathname;

/** Drive the meter with a synthetic monotonic clock at a fixed spacing. */
function run(meter, frames, spacingMs, t0 = 1000) {
  let t = t0, last = 0;
  for (let i = 0; i < frames; i++) { t += spacingMs; last = meter.sample(t); }
  return last;
}

/**
 * Every DISTINCT value the meter published while being driven, in order.
 *
 * The reset arm below needs this because the quantity it is about — whether the restarting frame
 * is billed for the stopped gap — is visible only in the FIRST window the meter closes. The
 * obvious spelling (`run(...)`, compare the final number) does not discriminate: a 30 s gap
 * poisons one window and the next thirty frames at 60 Hz refill it, so both arms end at 60 and
 * the bar passes whether the reset is there or not. That was written, run, and found unfalsifiable
 * before this helper existed — §418.3 catching a bar at authoring time rather than in a seal.
 */
function readings(meter, frames, spacingMs, t0 = 1000) {
  const out = [];
  let t = t0, seen = meter.windows;
  for (let i = 0; i < frames; i++) {
    t += spacingMs;
    const v = meter.sample(t);
    /* Keyed on `windows`, not on the value changing: a stalled machine publishes 0.0, which is
       also the meter's pre-warm value, so "the number changed" cannot tell a real reading from
       an unmeasured one. That ambiguity is what `windows` exists to remove. */
    if (meter.windows > seen) { seen = meter.windows; out.push(v); }
  }
  return out;
}

/** The old law, transcribed, so the comparison is against the real thing and not a paraphrase. */
function oldLaw(frames, spacingMs, timeScale = 1) {
  let accum = 0, n = 0, fps = 0;
  for (let i = 0; i < frames; i++) {
    const dt = Math.min(spacingMs / 1000, 1 / 20) * timeScale;
    accum += dt || 1 / 60;
    n++;
    if (accum >= 0.5) { fps = Math.round(n / accum); accum = 0; n = 0; }
  }
  return fps;
}

test('enginefps: the meter reports the wall-clock rate at both ends of the range', () => {
  /* DOMAIN (§418.3)
   *   passes on : 120 frames spaced 16.667 ms — a 60 Hz machine. Reads 60.
   *   fails  on : 120 frames spaced 1400 ms — this container's measured 0.71 fps. Reads 0.7.
   * Both inputs are exercised in this arm, and they land on opposite sides of every threshold
   * asserted below. The second is the input the OLD expression could not represent: the
   * `oldLaw` arm underneath shows it returning 20 on the identical sequence. */
  const fast = run(new FpsMeter(), 120, 1000 / 60);
  const slow = run(new FpsMeter(), 120, 1400);

  assert.equal(fast, 60, `60 Hz spacing must read 60, got ${fast}`);
  assert.ok(slow > 0.6 && slow < 0.8, `1400 ms spacing must read ~0.71, got ${slow}`);
  assert.ok(slow < fast, 'the slow machine must not out-report the fast one');
  console.log(`\n[fps] 16.667 ms spacing -> ${fast} fps   ·   1400 ms spacing -> ${slow} fps`);
});

test('enginefps: the OLD law returns 20 on the very input this container produced', () => {
  /* DOMAIN (§418.3)
   *   passes on : 1400 ms spacing — the old law returns 20, the saturated answer. This is the
   *               demonstration, so "passes" here means "reproduces the defect".
   *   fails  on : 16.667 ms spacing — the old law returns 60, which is correct. Above 20 fps it
   *               was never wrong, which is exactly why this survived: the counter is right on
   *               every machine anyone developed on and wrong on every machine that needed it.
   * Both inputs are run below. If the old law ever stopped saturating, this arm goes red and
   * says the historical claim in the header no longer holds. */
  assert.equal(oldLaw(120, 1400), 20, 'the old law is supposed to saturate at 20 here');
  assert.equal(oldLaw(120, 1000 / 60), 60, 'the old law was correct above 20 fps');

  /* And the second half of the defect: slow motion inflated it. `timeScale` 0.25 on a 60 Hz
     machine reported 240. The new meter never sees timeScale — it reads a clock — so there is
     nothing to assert about it on FpsMeter, and pretending otherwise would be a bar entailed by
     construction (§418.2's mode C) rather than a check. It is recorded here as the old law's
     behaviour only. */
  assert.equal(oldLaw(600, 1000 / 60, 0.25), 240, 'the old law quadrupled under 0.25 timeScale');
  console.log('[fps] old law: 1400 ms -> 20 (saturated) · 16.667 ms -> 60 · timeScale 0.25 -> 240');
});

test('enginefps: a stopped loop is not billed to the frame that restarts it', () => {
  /* DOMAIN (§418.3)
   *   passes on : a 30 s gap followed by `reset()`, then 120 frames at 60 Hz. The FIRST value the
   *               meter publishes is 60 — the gap is not in it.
   *   fails  on : the identical sequence with NO reset. The first value published is 0, because
   *               the restarting frame is billed for all 30 s.
   * Both are run here. The bar is on `readings(...)[0]`, not on the final value, because the
   * final value is 60 either way — see `readings`' header for why the obvious spelling of this
   * arm could not fail.
   *
   * This is what makes the screenshot harness safe: `shot.mjs` holds the loop between steps via
   * `stopLoop`/`resumeLoop`, sometimes for minutes. */
  const withReset = new FpsMeter();
  withReset.sample(1000);
  withReset.reset();
  const good = readings(withReset, 120, 1000 / 60, 31000);

  const without = new FpsMeter();
  without.sample(1000);
  const bad = readings(without, 120, 1000 / 60, 31000);

  assert.equal(good[0], 60, `after a reset the first reading must be 60, got ${good[0]}`);
  assert.equal(bad[0], 0, `without a reset the 30 s gap must land in the first reading, got ${bad[0]}`);
  /* 120 frames at 60 Hz is 2 s against a 0.5 s window, so several values are published; every
     one of them must be 60. (Asserting a single publish was the first spelling and it was simply
     wrong about the arithmetic — recorded because it is the same species of mistake as the bar
     above: an expectation about the instrument that nobody had checked against its inputs.) */
  assert.ok(good.every((v) => v === 60), `every window of a steady 60 Hz run must read 60, got ${JSON.stringify(good)}`);
  assert.ok(bad.length > 1 && bad[bad.length - 1] === 60,
    `without a reset the meter must recover to 60 after the poisoned window, got ${JSON.stringify(bad)}`);
  console.log(`[fps] 30 s gap: with reset -> ${JSON.stringify(good)} · without -> ${JSON.stringify(bad)}`);
});

test('enginefps: a clock that jumps backwards or stalls is dropped, not absorbed', () => {
  /* DOMAIN (§418.3)
   *   passes on : an interval of -50 ms and one of 120 s, both injected mid-run; the meter still
   *               reports 60 from the surrounding good frames.
   *   fails  on : the same two intervals with the guard removed — they would enter `_accum` and
   *               drag the window to a nonsense value. Verified by construction of the guard
   *               (`d > 0 && d < 60`), and the negative interval is the half that matters: it
   *               would SUBTRACT from the accumulated time and could push it below zero.
   * Labelled honestly: only the passing side is executed here. The failing side is an argument
   * about the guard, not an observation, so this arm is a TRIPWIRE for the guard's removal
   * rather than evidence that both branches were seen. */
  const m = new FpsMeter();
  let t = 1000;
  for (let i = 0; i < 30; i++) { t += 1000 / 60; m.sample(t); }
  m.sample(t - 50);              // clock stepped backwards
  t += 120000; m.sample(t);      // a two-minute stall
  for (let i = 0; i < 90; i++) { t += 1000 / 60; m.sample(t); }
  assert.ok(m.fps > 30, `bad intervals must not poison the window, got ${m.fps}`);
  console.log(`[fps] after a -50 ms step and a 120 s stall: ${m.fps} fps`);
});

test('enginefps: Engine wires the meter to the wall clock and resets it with the loop', () => {
  /* DOMAIN (§418.3)
   *   passes on : the current `src/core/Engine.js`.
   *   fails  on : the file as it stood before this change, which contained `this._fpsAccum +=
   *               this.dt` and no `_fps.sample`. Both were run against this arm while writing it.
   * A source assertion rather than a behavioural one because `Engine` needs a WebGL context and
   * a DOM to instantiate, so the wiring itself cannot be exercised in node — this is the seam,
   * and it is named as such rather than dressed up as a functional test. */
  const src = readFileSync(SRC, 'utf8');
  assert.ok(!/_fpsAccum\s*\+=\s*this\.dt/.test(src),
    'the simulation delta is back in the fps accumulator — see this file\'s header');
  assert.ok(/this\.stats\.fps\s*=\s*this\._fps\.sample\(/.test(src),
    'renderFrame no longer feeds the meter');
  assert.equal((src.match(/this\._fps\.reset\(\)/g) || []).length, 2,
    'both start() and resumeLoop() must reset the meter');
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { OfflineCtx, rms, peak, centroid, onset, mp3Scan, selfTest } from './webaudio.mjs';
import { SFX, SFX_NAMES, stepFor, STEP_SURFACES } from '../src/audio/Sfx.js';
import {
  equalPowerCurve, ALERT_FOR_STATE, SECTION_FOR_ALERT,
  STEM_STATS, STEM_MAKEUP, TRACK_SECTION, SECTION_STEM, STEM_FILES, TUNE,
} from '../src/audio/Audio.js';
import { rng } from '../src/core/Rand.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..');
const SR = 44100;

/**
 * Audio, measured rather than described.
 *
 * ── Why this file is possible at all ───────────────────────────────────────────────────────
 * `Synth.js` was written against an explicit `BaseAudioContext` on purpose — its own header
 * says so — precisely so the shipping recipes could be rendered somewhere they can be looked
 * at. `tests/webaudio.mjs` is that somewhere. Everything below renders the code the game runs
 * and asserts on the samples that come out: RMS, spectral centroid, peak, crossfade continuity.
 * No screenshot, no lock, about a second and a half of CPU.
 *
 * ── The thresholds, and when they were fixed ───────────────────────────────────────────────
 * Every number in this file was registered BEFORE the candidate it judges existed (§141.1),
 * and two of them were registered as REPLACEMENTS after measurement voided their predecessor.
 * That history is stated here rather than quietly tidied away:
 *
 *   T1 (rejected). `Audio.js` claimed the three music cues were "three mixes of the same piece
 *      at the same tempo". Registered gate: envelope cross-correlation >= 0.50 at zero lag with
 *      argmax within +-0.10 s. Measured 0.122 (explore/sneak) and 0.013 (explore/chase). The
 *      calibration arm — the same measure against a time-reversed copy of explore — scored
 *      0.163, so the instrument discriminates and the claim is simply false. They are three
 *      separate pieces; commit 6f03a03 calls them "the three Black Chateau loops".
 *
 *   T2 (failed its gate). Per-stem tempo autocorrelation peaks all cleared 1.25x the band
 *      median, but the estimates were 120 / 80 / 80 BPM and the registered rule required
 *      agreement within +-1.5 %. So NO shared bar grid was invented, and transitions are not
 *      quantised to one. That is a real limitation and it is recorded, not papered over.
 *
 *   T3 (VOID, not re-derived). It asserted a flat AMPLITUDE sum through a crossfade, which is
 *      the correct criterion only for CORRELATED signals — the assumption T1 had just refuted.
 *      Declared void and replaced by T3' below, registered before the fix was written.
 *
 * ── §211.1 ─────────────────────────────────────────────────────────────────────────────────
 * Nine tests in this project's first suite read a property the data did not have, iterated
 * nothing, and reported green. So every data-driven test here asserts a non-zero inspected
 * count, and every threshold carries a calibration arm that MUST fire. A footstep test that
 * cannot tell two surfaces apart when they ARE the same is not measuring anything.
 */

/* ==========================================================================
   0. The instrument itself
========================================================================== */

test('renderer is calibrated against closed-form answers', () => {
  const r = selfTest();
  const lines = r.results.map((x) => `${x.name}: got ${x.got} want ${x.want} (tol ${x.tol})`);
  assert.ok(r.results.length >= 6, 'self-test must actually check things');
  assert.ok(r.ok, `renderer self-test failed:\n${lines.join('\n')}`);
});

/* ==========================================================================
   T3' — crossfade continuity, at the measured correlation
========================================================================== */

/** Perceived level of two signals mixed at gains a,b with correlation rho. */
function level(a, b, rho) { return Math.sqrt(a * a + b * b + 2 * rho * a * b); }
const dB = (x) => 20 * Math.log10(Math.max(1e-12, x));

/** The measured envelope correlation, larger of the two pairs — most favourable to linear. */
const RHO = 0.122;
const T3_GATE_DB = 0.5;          // registered before equalPowerCurve was written
const T3_ARM_DB = 2.0;           // linear must fail by at least this much, or the arm is blind

test("T3' equal-power crossfade holds level within 0.5 dB at the measured correlation", () => {
  const N = 257;
  const down = equalPowerCurve(1, 0, N);
  const up = equalPowerCurve(0, 1, N);
  assert.equal(down.length, N);
  assert.equal(up.length, N);

  let worst = 0, worstAt = 0, inspected = 0;
  for (let i = 0; i < N; i++) {
    const d = Math.abs(dB(level(down[i], up[i], RHO)));
    inspected++;
    if (d > worst) { worst = d; worstAt = i / (N - 1); }
  }
  assert.ok(inspected === N && inspected > 100, `inspected ${inspected} points`);
  assert.ok(worst <= T3_GATE_DB,
    `equal-power crossfade deviates ${worst.toFixed(3)} dB at x=${worstAt.toFixed(3)} (gate ${T3_GATE_DB})`);
});

test("T3' CALIBRATION ARM: the linear crossfade it replaced must fail the same gate", () => {
  const N = 257;
  let worst = 0, worstAt = 0;
  for (let i = 0; i < N; i++) {
    const x = i / (N - 1);
    const d = Math.abs(dB(level(1 - x, x, RHO)));
    if (d > worst) { worst = d; worstAt = x; }
  }
  // If this does NOT fire, the gate above is vacuous and proves nothing.
  assert.ok(worst >= T3_ARM_DB,
    `arm did not fire: linear crossfade only deviates ${worst.toFixed(3)} dB — the instrument is blind`);
  assert.ok(Math.abs(worstAt - 0.5) < 0.02, `linear should be worst at the midpoint, was ${worstAt}`);
});

test("T3' crossfade is monotone and lands exactly on 0 and 1", () => {
  const down = equalPowerCurve(1, 0, 129);
  const up = equalPowerCurve(0, 1, 129);
  assert.equal(down[0], 1); assert.equal(down[down.length - 1], 0);
  assert.equal(up[0], 0); assert.equal(up[up.length - 1], 1);
  let steps = 0;
  for (let i = 1; i < down.length; i++) {
    assert.ok(down[i] <= down[i - 1] + 1e-6, `fade-out rose at ${i}`);
    assert.ok(up[i] >= up[i - 1] - 1e-6, `fade-in fell at ${i}`);
    steps++;
  }
  assert.ok(steps > 100, `inspected ${steps} steps`);
});

test("T3' an interrupted crossfade resumes power-complementary rather than jumping", () => {
  // Both faders are parameterised by the same x, so if they were complementary when the new
  // request arrived they must still be complementary all the way across the new fade.
  let checked = 0;
  for (const x0 of [0.15, 0.35, 0.5, 0.72, 0.9]) {
    const vOut = Math.cos((Math.PI / 2) * x0);
    const vIn = Math.sin((Math.PI / 2) * x0);
    const a = equalPowerCurve(vOut, 0, 65);
    const b = equalPowerCurve(vIn, 1, 65);
    for (let i = 0; i < a.length; i++) {
      const d = Math.abs(dB(level(a[i], b[i], RHO)));
      assert.ok(d <= T3_GATE_DB,
        `resume from x0=${x0} deviates ${d.toFixed(3)} dB at step ${i}`);
      checked++;
    }
    // And the fade must actually start where the fader already was, not snap.
    assert.ok(Math.abs(a[0] - vOut) < 1e-6, `fade-out did not resume from ${vOut}`);
    assert.ok(Math.abs(b[0] - vIn) < 1e-6, `fade-in did not resume from ${vIn}`);
  }
  assert.ok(checked > 300, `inspected ${checked} points`);
});

test('the music transition uses ONE window for arrangement, level and filter', () => {
  // Two windows put a level step in the middle of the crossfade. `music()` and `_selectStem()`
  // both read TUNE.stemFade; this pins the constant so a future edit cannot re-split them.
  assert.ok(TUNE.stemFade > 0.8 && TUNE.stemFade < 4,
    `stemFade ${TUNE.stemFade}s is outside anything musical`);
  const src = readFileSync(join(ROOT, 'src/audio/Audio.js'), 'utf8');
  const hits = src.match(/TUNE\.stemFade/g) || [];
  assert.ok(hits.length >= 4, `stemFade referenced ${hits.length} times; expected the fade, the
    level ramp, the filter ramp and the fade-end bookkeeping all to share it`);
  assert.ok(!/linearRampToValueAtTime\([^)]*,\s*t \+ 1\.2\)/.test(src),
    'a 1.2 s level ramp is still scheduled against a longer arrangement crossfade');
});

/* ==========================================================================
   T7 — the three cues arrive at comparable level
========================================================================== */

const T7_SPREAD_DB = 12;         // registered before STEM_MAKEUP existed
const SHIPPED_SECTION_LEVEL = { explore: 1.00, sneak: 0.55, chase: 1.00 };   // the pre-fix table

/** Steady-state level of a cue as it reaches the music bus. */
function stemLevel(name, sectionLevel, makeup) {
  return STEM_STATS[name].rms * makeup * TUNE.trackLevel * sectionLevel;
}

/** The loudest TRACK_SECTION level of any section that maps to this cue. */
function maxSectionLevel(stem) {
  let m = 0, n = 0;
  for (const [section, s] of Object.entries(SECTION_STEM)) {
    if (s !== stem) continue;
    m = Math.max(m, TRACK_SECTION[section].level);
    n++;
  }
  assert.ok(n > 0, `no section maps to stem "${stem}"`);
  return m;
}

test('T7 every music cue lands within 12 dB of the loudest one', () => {
  const levels = {};
  let inspected = 0;
  for (const name of Object.keys(STEM_STATS)) {
    levels[name] = stemLevel(name, maxSectionLevel(name), STEM_MAKEUP[name]);
    inspected++;
  }
  assert.ok(inspected === 3, `inspected ${inspected} cues`);
  const top = Math.max(...Object.values(levels));
  for (const [name, v] of Object.entries(levels)) {
    const down = dB(v / top);
    assert.ok(down >= -T7_SPREAD_DB,
      `cue "${name}" sits ${(-down).toFixed(1)} dB below the loudest (gate ${T7_SPREAD_DB} dB)`);
  }
});

test('T7 CALIBRATION ARM: the shipped pre-fix levels must fail the same gate', () => {
  const levels = {};
  for (const name of Object.keys(STEM_STATS)) {
    levels[name] = stemLevel(name, SHIPPED_SECTION_LEVEL[name], 1);   // no makeup, old section level
  }
  const top = Math.max(...Object.values(levels));
  const worst = Math.min(...Object.values(levels).map((v) => dB(v / top)));
  assert.ok(worst < -T7_SPREAD_DB,
    `arm did not fire: the pre-fix mix was only ${(-worst).toFixed(1)} dB down — the gate proves nothing`);
});

test('T7 no cue can clip: peak stays at or under unity through the track gain', () => {
  let inspected = 0;
  for (const name of Object.keys(STEM_STATS)) {
    const p = STEM_STATS[name].peak * STEM_MAKEUP[name] * TUNE.trackLevel * maxSectionLevel(name);
    assert.ok(p <= 1.0 + 1e-3, `cue "${name}" peaks at ${p.toFixed(4)} after makeup`);
    inspected++;
  }
  assert.equal(inspected, 3);
});

test('T7 makeup follows its stated rule rather than being dialled by ear', () => {
  const refRms = STEM_STATS.explore.rms;
  let inspected = 0;
  for (const name of Object.keys(STEM_STATS)) {
    const want = Math.min(
      refRms / STEM_STATS[name].rms,
      1 / (STEM_STATS[name].peak * TUNE.trackLevel * maxSectionLevel(name)),
    );
    assert.ok(Math.abs(STEM_MAKEUP[name] - want) < 0.005,
      `makeup for "${name}" is ${STEM_MAKEUP[name]}, rule gives ${want.toFixed(4)}`);
    inspected++;
  }
  assert.equal(inspected, 3);
});

/* ==========================================================================
   The committed constants still describe the committed bytes
========================================================================== */

test('STEM_STATS durations agree with a frame scan of the actual MP3s', () => {
  let inspected = 0;
  for (const [name, file] of Object.entries(STEM_FILES)) {
    const bytes = readFileSync(join(ROOT, 'public/assets/audio', file));
    const scan = mp3Scan(bytes);
    assert.ok(scan.frames > 1000, `"${file}" scanned only ${scan.frames} frames`);
    assert.equal(scan.sampleRate, 44100, `"${file}" is not 44.1 kHz`);
    const drift = Math.abs(scan.duration - STEM_STATS[name].duration);
    assert.ok(drift < 0.01,
      `"${file}" is ${scan.duration.toFixed(4)}s, STEM_STATS says ${STEM_STATS[name].duration}s`);
    inspected++;
  }
  assert.equal(inspected, 3, 'every declared stem file must have been scanned');
});

test('the cues have materially different lengths, so nothing may assume a shared loop phase', () => {
  // This is the fact that killed the old `_stemEpoch`. If a future edit ever swaps in three
  // equal-length files the assumption becomes safe again — and this test will say so by failing.
  const ds = Object.values(STEM_STATS).map((s) => s.duration);
  const spread = Math.max(...ds) - Math.min(...ds);
  assert.ok(spread > 1.0,
    `cue lengths now differ by only ${spread.toFixed(3)}s; re-examine the start-at-zero rule`);
  const src = readFileSync(join(ROOT, 'src/audio/Audio.js'), 'utf8');
  assert.ok(!/_stemEpoch\s*=/.test(src),
    'phase-alignment bookkeeping is back, but the cues are still unrelated pieces');
});

/* ==========================================================================
   T4 — the detection ladder has a rung for every state the guards can be in
========================================================================== */

/** Read STATE out of the GUARDS agent's file without importing three.js through Guard.js. */
function readGuardStates() {
  const src = readFileSync(join(ROOT, 'src/ai/Patrol.js'), 'utf8');
  const block = src.match(/export const STATE = \{([\s\S]*?)\}/);
  assert.ok(block, 'could not find `export const STATE` in src/ai/Patrol.js');
  const states = [];
  for (const m of block[1].matchAll(/(\w+)\s*:\s*'([^']+)'/g)) states.push(m[2]);
  return states;
}

test('T4 every guard state has a rung on the audio ladder', () => {
  const states = readGuardStates();
  assert.ok(states.length >= 5, `inspected ${states.length} guard states; expected the full set`);
  const missing = states.filter((s) => ALERT_FOR_STATE[s] === undefined);
  assert.deepEqual(missing, [],
    `guard states with no audio rung: ${missing.join(', ')} — a state the player can only see`);
  // And nothing invented: the table must not name states the guards cannot be in.
  const extra = Object.keys(ALERT_FOR_STATE).filter((k) => !states.includes(k));
  assert.deepEqual(extra, [], `ladder names states no guard has: ${extra.join(', ')}`);
});

test('T4 CALIBRATION ARM: the same check must reject a ladder missing a rung', () => {
  const states = readGuardStates();
  const holed = { ...ALERT_FOR_STATE };
  delete holed.searching;
  const missing = states.filter((s) => holed[s] === undefined);
  assert.ok(missing.includes('searching'),
    'arm did not fire: the coverage check cannot see a deleted rung, so it proves nothing');
});

test('T4 the hunting rungs strictly increase, and searching/lost are NOT calm', () => {
  assert.ok(ALERT_FOR_STATE.suspicious < ALERT_FOR_STATE.searching,
    'suspicious must sit below searching');
  assert.ok(ALERT_FOR_STATE.searching < ALERT_FOR_STATE.chase,
    'searching must sit below chase');
  // The specific defect this replaced: both of these used to fall through to 0.
  assert.ok(ALERT_FOR_STATE.searching > 0, 'a searching guard is not calm');
  assert.ok(ALERT_FOR_STATE.lost > 0, 'a guard who just lost sight of you is not calm');
  assert.equal(ALERT_FOR_STATE.patrol, 0);
});

test('T4 every rung selects a music section, and they are all distinct', () => {
  const top = Math.max(...Object.values(ALERT_FOR_STATE));
  assert.ok(SECTION_FOR_ALERT.length === top + 1,
    `${top + 1} rungs but ${SECTION_FOR_ALERT.length} sections`);
  assert.equal(new Set(SECTION_FOR_ALERT).size, SECTION_FOR_ALERT.length,
    `two rungs share a section: ${SECTION_FOR_ALERT.join(', ')}`);
  for (const s of SECTION_FOR_ALERT) {
    assert.ok(TRACK_SECTION[s], `rung section "${s}" has no TRACK_SECTION entry`);
    assert.ok(SECTION_STEM[s], `rung section "${s}" has no cue`);
  }
});

test('T4 every rung has a sound of its own', () => {
  // A rung whose only expression is a music section is a rung the player misses while
  // looking somewhere else. `searching` is the one that had nothing.
  for (const name of ['guard_confused', 'search_call', 'alert_sting', 'guard_grunt', 'guard_shout']) {
    assert.ok(SFX[name], `the ladder fires "${name}" and the catalogue has no such entry`);
  }
  const src = readFileSync(join(ROOT, 'src/audio/Audio.js'), 'utf8');
  assert.ok(/search_call/.test(src), 'the searching rung fires nothing');
  assert.ok(/alert_sting/.test(src), 'the chase rung fires nothing');
});

/* ==========================================================================
   Rendering the catalogue
========================================================================== */

/** Render one SFX recipe solo at its own base gain, exactly as the mixer would. */
function renderSfx(name, opts = {}, seconds = null) {
  const def = SFX[name];
  const ctx = new OfflineCtx(SR);
  const g = ctx.createGain();
  g.gain.value = def.g;
  g.connect(ctx.destination);
  const o = {
    r: rng(0x5119c00), rate: 1, variant: 0, index: 1, streak: 0,
    force: 1, surface: 'stone', gait: 'walk', ...opts,
  };
  const built = def.build(ctx, g, 0.01, o);
  const end = built && Number.isFinite(built.end) ? built.end : null;
  const dur = seconds ?? Math.min(2.2, (end ?? def.dur ?? 0.5) + 0.08);
  return ctx.render(dur);
}

function describe(name, opts = {}) {
  const d = renderSfx(name, opts);
  const c = centroid(d, SR, { size: 1024, hop: 256 });
  return { rms: rms(d), peak: peak(d), hz: c.hz, frames: c.frames, onset: onset(d) };
}

/* ---- T5: surfaces ---- */

const T5_CENTROID = 0.12;        // registered before the STEP table was touched
const T5_RMS = 0.15;
const T5_TWIN = 0.01;            // the arm: identical inputs must differ by less than this

test('T5 every authored surface is a distinct sound', () => {
  const m = {};
  for (const s of STEP_SURFACES) {
    const name = stepFor(s);
    assert.ok(SFX[name], `stepFor('${s}') -> "${name}" which is not in the catalogue`);
    m[s] = describe(name);
    assert.ok(m[s].frames > 0, `"${name}" rendered no analysable frames`);
    assert.ok(m[s].rms > 1e-5, `"${name}" rendered silence`);
  }
  assert.ok(Object.keys(m).length >= 5, `inspected ${Object.keys(m).length} surfaces`);

  let pairs = 0;
  const failures = [];
  for (let i = 0; i < STEP_SURFACES.length; i++) {
    for (let j = i + 1; j < STEP_SURFACES.length; j++) {
      const a = m[STEP_SURFACES[i]], b = m[STEP_SURFACES[j]];
      const dc = Math.abs(a.hz - b.hz) / Math.min(a.hz, b.hz);
      const dr = Math.abs(a.rms - b.rms) / Math.min(a.rms, b.rms);
      pairs++;
      if (dc < T5_CENTROID && dr < T5_RMS) {
        failures.push(`${STEP_SURFACES[i]}/${STEP_SURFACES[j]}: centroid ${(dc * 100).toFixed(1)}% `
          + `(${a.hz.toFixed(0)} vs ${b.hz.toFixed(0)} Hz), rms ${(dr * 100).toFixed(1)}%`);
      }
    }
  }
  assert.ok(pairs >= 10, `inspected ${pairs} surface pairs`);
  assert.deepEqual(failures, [], `surfaces a player cannot tell apart:\n  ${failures.join('\n  ')}`);
});

test('T5 CALIBRATION ARM: the same surface twice must measure the same', () => {
  // If this arm does not fire, the pairwise test above is measuring render noise, not material.
  let checked = 0;
  for (const s of ['stone', 'wood', 'water']) {
    const a = describe(stepFor(s));
    const b = describe(stepFor(s));
    const dc = Math.abs(a.hz - b.hz) / Math.min(a.hz, b.hz);
    assert.ok(dc < T5_TWIN,
      `arm failed: "${s}" rendered twice differs by ${(dc * 100).toFixed(2)}% — the instrument is noisy`);
    checked++;
  }
  assert.equal(checked, 3);
});

test("T5 the world's surface tags all reach a real footstep", () => {
  // `water` is the one that did not: the level tags Nile geometry `water` and stepFor sent it
  // to stone. An unlabelled surface may fall through to stone; an authored one may not.
  let inspected = 0;
  for (const s of STEP_SURFACES) {
    const got = stepFor(s);
    assert.equal(got, `step_${s}`, `authored surface "${s}" falls through to "${got}"`);
    inspected++;
  }
  assert.ok(inspected >= 6, `inspected ${inspected} tags`);
  assert.equal(stepFor('no-such-material'), 'step_stone', 'unknown surfaces should still be stone');
});

/* ---- gait ---- */

test('gait changes the sound, not just the level', () => {
  const sneak = describe('step_stone', { gait: 'sneak' });
  const walk = describe('step_stone', { gait: 'walk' });
  const run = describe('step_stone', { gait: 'run' });

  // Level order is the easy part.
  assert.ok(sneak.rms < walk.rms, `sneak ${sneak.rms} is not quieter than walk ${walk.rms}`);
  assert.ok(run.rms > walk.rms, `run ${run.rms} is not louder than walk ${walk.rms}`);

  // The part that matters: a sneaking foot is rolled down, so it must be DULLER, not merely
  // quieter. The first version of the GAIT table failed exactly here — attenuating everything
  // uniformly cut the low body too and rendered sneak BRIGHTER than walk (1653 vs 1116 Hz).
  assert.ok(sneak.hz < walk.hz,
    `sneak centroid ${sneak.hz.toFixed(0)} Hz is not below walk ${walk.hz.toFixed(0)} Hz — `
    + 'this is a volume change wearing a gait\'s name');
  const drop = (walk.hz - sneak.hz) / walk.hz;
  assert.ok(drop > 0.08, `sneak is only ${(drop * 100).toFixed(1)}% duller than walk`);
});

test('gait applies to guards too, so a running guard sounds like one', () => {
  const walk = describe('guard_step', { gait: 'walk', surface: 'stone' });
  const run = describe('guard_step', { gait: 'run', surface: 'stone' });
  assert.ok(run.rms > walk.rms * 1.05,
    `a charging guard (${run.rms.toFixed(5)}) must be louder than a patrolling one (${walk.rms.toFixed(5)})`);
});

/* ---- T6: headroom ---- */

/**
 * One pass over the whole catalogue, shared by the tests below — rendering all of it twice
 * doubled the suite's runtime for no extra information.
 */
let CATALOGUE = null;
function catalogue() {
  if (CATALOGUE) return CATALOGUE;
  CATALOGUE = new Map();
  for (const name of SFX_NAMES) {
    const d = renderSfx(name, {}, SFX[name].loop ? 1.6 : null);
    CATALOGUE.set(name, { peak: peak(d), rms: rms(d) });
  }
  return CATALOGUE;
}

test('T6 nothing in the catalogue clips at its own base gain', () => {
  const all = catalogue();
  const hot = [];
  for (const [name, m] of all) {
    assert.ok(Number.isFinite(m.peak), `"${name}" rendered a non-finite sample`);
    if (m.peak > 1.0) hot.push(`${name} peaks at ${m.peak.toFixed(3)}`);
  }
  assert.equal(all.size, SFX_NAMES.length);
  assert.ok(all.size > 20, `inspected ${all.size} sounds`);
  assert.deepEqual(hot, [], `sounds that clip before the mixer even places them:\n  ${hot.join('\n  ')}`);
});

test('T6 CALIBRATION ARM: an over-driven render must be caught', () => {
  const d = renderSfx('cane_hit');
  const scaled = Float32Array.from(d, (v) => v * 8);
  assert.ok(peak(scaled) > 1.0,
    'arm did not fire: an 8x render did not exceed unity, so the ceiling test proves nothing');
  assert.ok(peak(d) <= 1.0, 'the unscaled render should have been under the ceiling');
});

test('nothing in the catalogue renders silence', () => {
  const all = catalogue();
  const dead = [];
  for (const [name, m] of all) if (m.rms < 1e-6) dead.push(name);
  assert.equal(all.size, SFX_NAMES.length);
  assert.ok(all.size > 20, `inspected ${all.size} sounds`);
  assert.deepEqual(dead, [], `recipes that make no sound at all: ${dead.join(', ')}`);
});

/* ---- the searching cue is its own thing ---- */

test('the searching cue is not the alert sting with the level down', () => {
  const search = describe('search_call');
  const alert = describe('alert_sting');
  assert.ok(search.frames > 0 && alert.frames > 0);
  const dc = Math.abs(search.hz - alert.hz) / Math.min(search.hz, alert.hz);
  assert.ok(dc > 0.12,
    `search_call (${search.hz.toFixed(0)} Hz) and alert_sting (${alert.hz.toFixed(0)} Hz) `
    + `differ by only ${(dc * 100).toFixed(1)}% — the player cannot tell hunting from caught`);
  // And it must be the softer of the two, because it is the rung you can still walk away from.
  assert.ok(search.rms < alert.rms, 'the searching cue should not be louder than being caught');
});

/* ==========================================================================
   End to end — the real mixer, on the real signal path
========================================================================== */

/**
 * `Audio.unlock(existing)` takes a context from outside precisely so the SHIPPING graph — pool,
 * panners, sends, limiter, the lot — can be driven offline rather than a reimplementation of it.
 * These tests use that door. Everything here exercises `src/audio/Audio.js` itself; the mock is
 * only the room it plays in.
 */
function stubEngine() {
  const handlers = new Map();
  const modules = new Map();
  return {
    quality: 'high', dt: 1 / 60, warnings: [], scene: null, camera: null,
    on(evt, fn) {
      if (!handlers.has(evt)) handlers.set(evt, []);
      handlers.get(evt).push(fn);
      return () => {};
    },
    emit(evt, p) { for (const fn of handlers.get(evt) || []) fn(p); },
    get(name) { return modules.get(name) || null; },
    set(name, mod) { modules.set(name, mod); },
    warn(msg) { this.warnings.push(msg); },
  };
}

async function bootAudio(engine = stubEngine()) {
  const { Audio } = await import('../src/audio/Audio.js');
  const a = new Audio(engine);
  a.available = true;
  await a.init();
  const ctx = new OfflineCtx(SR);
  const ok = a.unlock(ctx);
  return { a, ctx, engine, ok };
}

test('the shipping mixer boots on an offline context and stays silent-safe', async () => {
  const { a, engine, ok } = await bootAudio();
  assert.ok(ok, `unlock() failed: ${engine.warnings.join('; ')}`);
  assert.ok(a.ready, 'audio reported not ready after unlock');
  const info = a.debugInfo();
  assert.ok(info.voices > 20, `only ${info.voices} voices in the pool`);
  assert.equal(info.names, SFX_NAMES.length);
  a.dispose();
  assert.equal(a.ready, false, 'dispose() left the mixer live');
});

test('a guard going quiet does not cancel another guard chasing you', async () => {
  // The defect this replaces: `this._alert = level` from whichever guard spoke last, so any
  // guard returning to patrol dropped the whole score out of chase.
  const { a, engine } = await bootAudio();
  engine.emit('guardAlert', { id: 1, state: 'chase', pos: { x: 0, y: 0, z: 0 } });
  assert.equal(a._alert, 3, 'a chasing guard should put the score on the top rung');
  engine.emit('guardAlert', { id: 2, state: 'suspicious', pos: { x: 4, y: 0, z: 0 } });
  assert.equal(a._alert, 3, 'a second, calmer guard must not lower the alert');
  engine.emit('guardAlert', { id: 2, state: 'patrol', pos: { x: 4, y: 0, z: 0 } });
  assert.equal(a._alert, 3, 'guard 2 standing down cancelled guard 1 still chasing you');
  engine.emit('guardAlert', { id: 1, state: 'lost', pos: { x: 0, y: 0, z: 0 } });
  assert.equal(a._alert, 2, 'losing sight of you should drop to searching, not to calm');
  engine.emit('guardAlert', { id: 1, state: 'patrol', pos: { x: 0, y: 0, z: 0 } });
  assert.equal(a._alert, 0, 'with everyone back on patrol the score should relax');
  a.dispose();
});

test('every rung reached by a real guard state moves the music section', async () => {
  const { a, engine } = await bootAudio();
  const seen = new Map();
  let inspected = 0;
  for (const state of readGuardStates()) {
    engine.emit('guardAlert', { id: 'g', state, pos: { x: 0, y: 0, z: 0 } });
    seen.set(state, a._wantSection());
    inspected++;
  }
  assert.ok(inspected >= 5, `inspected ${inspected} states`);
  assert.equal(seen.get('chase'), 'chase');
  assert.equal(seen.get('searching'), 'alert');
  assert.equal(seen.get('lost'), 'alert');
  assert.equal(seen.get('suspicious'), 'sneak');
  assert.equal(seen.get('patrol'), 'explore');
  a.dispose();
});

test('guards are audible: footsteps fire from where the guard is standing', async () => {
  // `guard_step`, `armour_clank`, `spear_scrape` and `guard_yawn` were in the catalogue with no
  // caller anywhere in the project — the `guardSound` event this file listens for has no
  // emitter. A stealth game whose guards make no noise is missing its main input channel.
  const { a, engine } = await bootAudio();
  const played = [];
  const realPlay = a.play.bind(a);
  a.play = (name, opts) => { played.push({ name, opts }); return realPlay(name, opts); };

  const guard = { id: 7, state: 'patrol', position: { x: 0, y: 0, z: 0 } };
  engine.set('guards', { list: [guard] });
  a._lx = 0; a._ly = 1.6; a._lz = 0;

  // Walk him 4 m past the listener; at a 0.92 m stride that is four footfalls.
  for (let i = 0; i < 40; i++) {
    guard.position.x += 0.1;
    a._trackGuards(1 / 60);
  }
  const steps = played.filter((p) => p.name === 'guard_step');
  assert.ok(steps.length >= 3, `4 m of walking produced ${steps.length} footsteps`);
  for (const s of steps) {
    assert.ok(s.opts && s.opts.position, 'a guard footstep must carry a position, or it is not a cue');
    assert.equal(s.opts.position, guard.position);
  }
  a.dispose();
});

test('a guard beyond earshot costs nothing', async () => {
  const { a, engine } = await bootAudio();
  const played = [];
  a.play = (name) => { played.push(name); return null; };
  const guard = { id: 8, state: 'patrol', position: { x: TUNE.guardEarshot + 30, y: 0, z: 0 } };
  engine.set('guards', { list: [guard] });
  for (let i = 0; i < 60; i++) { guard.position.x += 0.1; a._trackGuards(1 / 60); }
  assert.deepEqual(played, [], `a guard ${TUNE.guardEarshot + 30} m away was audible`);
  a.dispose();
});

test('a chasing guard takes different steps from a patrolling one', async () => {
  const { a, engine } = await bootAudio();
  const gaits = [];
  a.play = (name, opts) => { if (name === 'guard_step') gaits.push(opts.gait); return null; };
  const guard = { id: 9, state: 'chase', position: { x: 1, y: 0, z: 0 } };
  engine.set('guards', { list: [guard] });
  for (let i = 0; i < 60; i++) { guard.position.x += 0.15; a._trackGuards(1 / 60); }
  assert.ok(gaits.length > 0, 'a charging guard made no sound at all');
  assert.ok(gaits.every((g) => g === 'run'), `chasing guard walked: ${[...new Set(gaits)].join(',')}`);
  a.dispose();
});

test('a malformed or absent guards module is silence, never a throw', async () => {
  const { a, engine } = await bootAudio();
  for (const shape of [null, {}, { list: [] }, { list: [null, {}, { position: null }] },
    { guards: [{ position: { x: 1, y: 0, z: 1 } }] }]) {
    engine.set('guards', shape);
    assert.doesNotThrow(() => { for (let i = 0; i < 5; i++) a._trackGuards(1 / 60); },
      `guards module shaped ${JSON.stringify(shape)} threw`);
  }
  a.dispose();
});

test('the mixer never throws on any event it subscribes to', async () => {
  const { a, engine } = await bootAudio();
  const events = [
    ['landed', { force: 12, pos: { x: 0, y: 0, z: 0 }, surface: 'water' }],
    ['jumped', { pos: { x: 0, y: 0, z: 0 } }], ['doubleJump', {}],
    ['caneHit', { pos: { x: 0, y: 0, z: 0 }, index: 3 }], ['caneSlam', {}],
    ['hookGrab', {}], ['hookRelease', {}], ['railMount', {}], ['poleMount', {}],
    ['spireLand', {}], ['wallRun', {}], ['wallJump', {}], ['ledgeGrab', {}],
    ['pickpocket', {}], ['paraglide', false], ['playerState', 'roll'],
    ['playerState', 'ko'], ['playerState', 'idle'],
    ['guardAlert', { id: 1, state: 'searching' }], ['guardAlert', 2], ['guardAlert', true],
    ['guardAlert', 'chase'], ['guardSpotted', null], ['guardLost', null],
    ['guardSound', 'guard_yawn'], ['guardSound', { name: 'armour_clank', pos: { x: 1, y: 0, z: 0 } }],
    ['thiefVision', true], ['thiefVision', false], ['coins', 4], ['coin', { amount: 2 }],
    ['clue', {}], ['binocucom', null], ['shake', 0.3], ['shot', null],
  ];
  let fired = 0;
  for (const [evt, payload] of events) {
    assert.doesNotThrow(() => engine.emit(evt, payload), `"${evt}" threw`);
    fired++;
  }
  assert.equal(fired, events.length);
  assert.ok(fired > 30, `only exercised ${fired} events`);
  assert.doesNotThrow(() => { for (let i = 0; i < 30; i++) a.update(1 / 60, i / 60); });
  a.dispose();
});

/* ---- transients ---- */

test('impacts have instant attacks and swells do not', () => {
  let inspected = 0;
  for (const name of ['cane_hit', 'step_stone', 'land_hard']) {
    const d = renderSfx(name);
    const at = onset(d, 0.02);
    assert.ok(at >= 0, `"${name}" never crosses the onset threshold`);
    // Scheduled at t=0.01 s; an impact must speak within 5 ms of that.
    assert.ok(at / SR - 0.01 < 0.005,
      `"${name}" takes ${((at / SR - 0.01) * 1000).toFixed(1)} ms to speak — that is not an impact`);
    inspected++;
  }
  for (const name of ['torch_whoosh', 'sand_shift']) {
    const d = renderSfx(name);
    const at = onset(d, 0.02);
    assert.ok(at >= 0, `"${name}" never crosses the onset threshold`);
    assert.ok(at / SR - 0.01 > 0.004,
      `"${name}" has a hard transient; it is supposed to swell`);
    inspected++;
  }
  assert.equal(inspected, 5);
});

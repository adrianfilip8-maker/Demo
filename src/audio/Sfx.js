import {
  EPS, gain, bq, osc, noise, chain, startAt, perc, swell, adsr, glide,
  noiseGesture, thump, metal, fmBell, voiceSyllable, noiseBuffer, crackleBuffer,
  waterBuffer, karplusBuffer, pulseWave, METAL_RATIOS,
} from './Synth.js';

/**
 * Sfx — the sound catalogue.
 *
 * Every entry is a *recipe*, not a sample: `build()` wires a small graph into the
 * voice's gain node and hands back the sources it started so the mixer can reclaim
 * them. Nothing here knows about panning, distance, reverb sends or voice limits —
 * that is Audio.js's job. This file only answers "what does it sound like".
 *
 * Entry fields:
 *   g     base gain (pre-distance)
 *   dur   nominal length in seconds; the mixer reclaims the voice after it
 *   loop  continuous source — needs an explicit stop()
 *   gap   minimum seconds between retriggers of this name (anti machine-gun)
 *   max   maximum concurrent voices of this name
 *   pri   0..3, higher survives voice stealing
 *   ref   panner reference distance — how far the sound carries
 *   duck  how hard it sidechains the music, 0..1
 *   flat  true = non-positional (UI, player-centric, stings)
 *   vary  per-play pitch spread; 0 disables (tuned sounds that must not detune)
 *
 * `o` carries the per-play variation: { r, rate, variant, ...params }.
 */

/* ---------------------------------------------------------------------------
   Local helpers
--------------------------------------------------------------------------- */

/** Collect a sub-voice's sources and track the latest end time. */
function add(bag, res) {
  if (!res) return bag.end;
  for (let i = 0; i < res.srcs.length; i++) bag.srcs.push(res.srcs[i]);
  if (res.end > bag.end) bag.end = res.end;
  return bag.end;
}

function bagOf(t) { return { srcs: [], end: t }; }

/** Pick one of n variants deterministically from the play's rng. */
function pick(o, arr) { return arr[(o.variant ?? 0) % arr.length]; }

/* ---------------------------------------------------------------------------
   Footsteps — four timbral variants per surface, on top of the mixer's
   per-play pitch/level jitter. Identical repeats are the fastest way to sound
   cheap, and footsteps repeat more than anything else in the game.
--------------------------------------------------------------------------- */

/**
 * ── What separates one surface from another, and why the first version failed ──────────────
 *
 * These numbers were set by ear and then measured, and the measurement disagreed. Rendered
 * through `tests/webaudio.mjs`, the shipped `stone` and `wood` came out **329 Hz and 348 Hz** —
 * 5.8 % apart in spectral centroid and 13.3 % apart in RMS, which is to say indistinguishable.
 * A temple level is mostly flagstone with wooden scaffolds over it, so the two surfaces the
 * player walks on most were the two that sounded the same.
 *
 * The cause was the `thump` body: at 185/245 Hz carrying a third of the energy it dominated the
 * spectrum of both, and the band that actually encodes the material (1750 vs 760 Hz) was a
 * detail on top of a shared low thud. The fix is physical rather than cosmetic —
 *
 *   **stone is dense: it clicks.** Almost no body, a bright hard transient, over immediately.
 *   **wood is hollow: it rings.** Real body, a pitched ~430 Hz resonance with a tail you can
 *   hear, and much less top end.
 *
 * so `stone` loses most of its body and gains a heel tick, and `wood` keeps its body and gains
 * a ring loud and long enough to be the thing you notice. `tests/audio.test.mjs` holds both
 * apart against a threshold registered before this edit existed.
 */
const STEP = {
  sand:  { band: 900,  q: 0.8, dur: 0.105, atk: 0.006,  g: 0.60, hp: 260,  body: 0,   bodyG: 0,    type: 'white', tail: 0.09 },
  stone: { band: 2150, q: 1.4, dur: 0.062, atk: 0.0012, g: 0.70, hp: 620,  body: 185, bodyG: 0.16, type: 'white', tail: 0, tick: 3600 },
  wood:  { band: 700,  q: 3.2, dur: 0.090, atk: 0.0018, g: 0.58, hp: 170,  body: 245, bodyG: 0.46, type: 'white', tail: 0, ring: 430 },
  metal: { band: 3050, q: 4.0, dur: 0.070, atk: 0.0010, g: 0.52, hp: 900,  body: 150, bodyG: 0.26, type: 'white', tail: 0, ring: 2650 },
  cloth: { band: 2100, q: 0.9, dur: 0.080, atk: 0.008,  g: 0.34, hp: 950,  body: 0,   bodyG: 0,    type: 'white', tail: 0.05 },
  /**
   * Water. Not a variant of anything else: a foot entering water displaces it, so the gesture is
   * a low `whump` of displaced mass, a broadband burst as the surface breaks, and then droplets
   * falling back over the next 200 ms. `drops` is what stops it reading as "noise with a lowpass".
   */
  water: { band: 620,  q: 0.7, dur: 0.140, atk: 0.004,  g: 0.66, hp: 150,  body: 120, bodyG: 0.30, type: 'white', tail: 0.16, drops: 6 },
};

const STEP_VARIANTS = [
  { f: 0.84, q: 1.15, d: 1.12, g: 0.92 },
  { f: 0.97, q: 0.90, d: 0.94, g: 1.05 },
  { f: 1.14, q: 1.30, d: 1.02, g: 0.97 },
  { f: 1.32, q: 0.80, d: 0.88, g: 0.90 },
];

/**
 * Gait. A sneaking step is not a walking step at lower volume — the foot is rolled down rather
 * than dropped, so the transient is slower, the bright band is weaker and the ring never speaks.
 * A run is the opposite: more weight through the heel and more top end off it. Level alone is
 * what makes a stealth game's sneak sound like someone turned the mixer down.
 */
const GAIT = {
  /* Sneak cuts the bright band and the heel tick far harder than it cuts the body, because that
     is what rolling a foot down actually does — there is no heel strike to make the top end
     with. Cutting everything by the same factor is just a volume change, and measurably RAISES
     the centroid (the body is the low-frequency part, so attenuating it makes the step
     brighter): the first version of this table did exactly that and rendered 1653 Hz against
     walk's 1116 Hz, i.e. a sneak that sounded sharper than a walk. */
  sneak: { g: 0.36, atk: 3.2, band: 0.42, tick: 0.12, body: 0.82, ring: 0.20, dur: 1.20 },
  walk:  { g: 1.00, atk: 1.0, band: 1.00, tick: 1.00, body: 1.00, ring: 1.00, dur: 1.00 },
  run:   { g: 1.18, atk: 0.7, band: 1.22, tick: 1.35, body: 1.28, ring: 1.15, dur: 0.92 },
};

function buildStep(ctx, out, t, o, surface, scale = 1) {
  const s = STEP[surface] || STEP.stone;
  const v = pick(o, STEP_VARIANTS);
  const gait = GAIT[o.gait] || GAIT.walk;
  const R = o.rate;
  const k = scale * gait.g;
  const bag = bagOf(t);

  add(bag, noiseGesture(ctx, out, t, {
    dur: s.dur * v.d * gait.dur, type: s.type, filter: 'bandpass',
    freq: s.band * v.f * R, q: s.q * v.q, hp: s.hp * R,
    gain: s.g * v.g * k * gait.band, attack: s.atk * gait.atk, r: o.r, seed: 21 + (o.variant | 0),
  }));

  // The scuff after the impact — sand, cloth and water keep hissing briefly, stone doesn't.
  if (s.tail > 0) {
    add(bag, noiseGesture(ctx, out, t + 0.012, {
      dur: s.tail * v.d, type: 'pink', filter: 'bandpass',
      freq: s.band * 1.7 * v.f * R, q: 0.7, gain: s.g * 0.3 * k,
      attack: 0.02, r: o.r, seed: 33,
    }));
  }
  // Body: the weight of the foot, not the texture of the ground.
  if (s.bodyG > 0) {
    add(bag, thump(ctx, out, t, {
      f0: s.body * R, f1: s.body * 0.55 * R, pitchDur: 0.03,
      dur: 0.055, gain: s.bodyG * k * gait.body, attack: 0.0012,
    }));
  }
  // The heel tick that makes flagstone flagstone — 12 ms, nothing but top.
  if (s.tick) {
    add(bag, noiseGesture(ctx, out, t, {
      dur: 0.012, filter: 'highpass', freq: s.tick * R, gain: 0.30 * k * gait.tick,
      attack: 0.0004, r: o.r, seed: 25 + (o.variant | 0),
    }));
  }
  // Metal and wood ring; sand does not.
  if (s.ring) {
    add(bag, metal(ctx, out, t, {
      base: s.ring * R * (0.9 + (o.variant | 0) * 0.06), dur: surface === 'metal' ? 0.30 : 0.22,
      gain: (surface === 'metal' ? 0.16 : 0.26) * k * gait.ring, hp: surface === 'metal' ? 1400 : 380,
      count: 4, spread: 0.8,
    }));
  }
  // Droplets falling back into the water after the foot has gone through.
  if (s.drops) {
    for (let i = 0; i < s.drops; i++) {
      add(bag, noiseGesture(ctx, out, t + 0.05 + i * 0.028 + o.r() * 0.04, {
        dur: 0.022, filter: 'bandpass', freq: 1600 + o.r() * 2800, q: 8,
        gain: 0.085 * (1 - i / (s.drops + 2)) * k, attack: 0.0008, r: o.r, seed: 27 + i,
      }));
    }
  }
  return bag;
}

/* ---------------------------------------------------------------------------
   The catalogue
--------------------------------------------------------------------------- */

export const SFX = {

  /* ===================== Sly — locomotion ============================= */

  step_sand:  { g: 0.55, dur: 0.22, gap: 0.075, max: 3, pri: 0, ref: 5, vary: 0.06, build: (c, o_, t, o) => buildStep(c, o_, t, o, 'sand') },
  step_stone: { g: 0.55, dur: 0.22, gap: 0.075, max: 3, pri: 0, ref: 5, vary: 0.06, build: (c, o_, t, o) => buildStep(c, o_, t, o, 'stone') },
  step_wood:  { g: 0.55, dur: 0.22, gap: 0.075, max: 3, pri: 0, ref: 5, vary: 0.06, build: (c, o_, t, o) => buildStep(c, o_, t, o, 'wood') },
  step_metal: { g: 0.50, dur: 0.36, gap: 0.075, max: 3, pri: 0, ref: 7, vary: 0.06, build: (c, o_, t, o) => buildStep(c, o_, t, o, 'metal') },
  step_cloth: { g: 0.45, dur: 0.20, gap: 0.075, max: 3, pri: 0, ref: 4, vary: 0.06, build: (c, o_, t, o) => buildStep(c, o_, t, o, 'cloth') },
  /** Wading the Nile. Carries further than a footstep because a splash is loud and wet. */
  step_water: { g: 0.60, dur: 0.42, gap: 0.075, max: 3, pri: 1, ref: 8, vary: 0.06, build: (c, o_, t, o) => buildStep(c, o_, t, o, 'water') },

  /** Guards are armoured and twice Sly's weight: same surfaces, more body, plus jingle. */
  guard_step: {
    g: 0.6, dur: 0.4, gap: 0.09, max: 4, pri: 1, ref: 8, vary: 0.05,
    build(ctx, out, t, o) {
      const bag = buildStep(ctx, out, t, o, o.surface || 'stone', 1.15);
      add(bag, thump(ctx, out, t, { f0: 120 * o.rate, f1: 46, pitchDur: 0.045, dur: 0.13, gain: 0.42, attack: 0.0015 }));
      add(bag, metal(ctx, out, t + 0.018, { base: 1900 * o.rate, dur: 0.16, gain: 0.07, hp: 2200, count: 3, spread: 0.7 }));
      return bag;
    },
  },

  land_soft: {
    g: 0.7, dur: 0.4, gap: 0.05, max: 2, pri: 2, ref: 7, vary: 0.05,
    build(ctx, out, t, o) {
      const bag = bagOf(t);
      add(bag, thump(ctx, out, t, { f0: 190 * o.rate, f1: 62, pitchDur: 0.05, dur: 0.16, gain: 0.55, attack: 0.0015 }));
      add(bag, noiseGesture(ctx, out, t, { dur: 0.10, filter: 'bandpass', freq: 1150 * o.rate, q: 0.8, gain: 0.34, attack: 0.002, r: o.r, seed: 44 }));
      add(bag, noiseGesture(ctx, out, t + 0.03, { dur: 0.13, type: 'pink', filter: 'highpass', freq: 1700, q: 0.7, gain: 0.10, attack: 0.02, r: o.r, seed: 45 }));
      return bag;
    },
  },

  land_hard: {
    g: 0.95, dur: 0.7, gap: 0.05, max: 2, pri: 3, ref: 11, duck: 0.18, vary: 0.05,
    build(ctx, out, t, o) {
      const bag = bagOf(t);
      const f = Math.min(1.6, 0.8 + (o.force || 1) * 0.35);
      add(bag, thump(ctx, out, t, { f0: 150 * o.rate, f1: 41, pitchDur: 0.075, dur: 0.30 * f, gain: 0.85, attack: 0.0012 }));
      add(bag, noiseGesture(ctx, out, t, { dur: 0.16, filter: 'lowpass', freq: 900 * o.rate, q: 0.9, gain: 0.5, attack: 0.001, r: o.r, seed: 46 }));
      add(bag, noiseGesture(ctx, out, t + 0.004, { dur: 0.055, filter: 'bandpass', freq: 2600, q: 1.1, gain: 0.22, attack: 0.0008, r: o.r, seed: 47 }));
      // Grit thrown up by the impact.
      for (let i = 0; i < 4; i++) {
        add(bag, noiseGesture(ctx, out, t + 0.05 + i * 0.035 + o.r() * 0.03, {
          dur: 0.03, filter: 'bandpass', freq: 2400 + o.r() * 2600, q: 6, gain: 0.05, attack: 0.001, r: o.r, seed: 48 + i,
        }));
      }
      return bag;
    },
  },

  /** Effort, not a word: a short voiced "hup" with the breath in front of it. */
  jump: {
    g: 0.34, dur: 0.35, gap: 0.09, max: 2, pri: 1, ref: 5, flat: true, vary: 0.04,
    build(ctx, out, t, o) {
      const bag = bagOf(t);
      add(bag, voiceSyllable(ctx, out, t, {
        f0: 235 * o.rate, f0End: 175 * o.rate, vowel: 'uh', vowelEnd: 'oo',
        dur: 0.12, gain: 0.42, attack: 0.012, release: 0.07, breath: 0.30, r: o.r,
      }));
      add(bag, noiseGesture(ctx, out, t - 0.0, { dur: 0.07, filter: 'highpass', freq: 1800, gain: 0.09, attack: 0.006, r: o.r, seed: 52 }));
      return bag;
    },
  },

  /** Double jump — the cane twirl. Two thin whooshes crossing, plus a small effort. */
  double_jump: {
    g: 0.55, dur: 0.5, gap: 0.08, max: 2, pri: 2, ref: 6, flat: true, vary: 0.05,
    build(ctx, out, t, o) {
      const bag = bagOf(t);
      for (let i = 0; i < 2; i++) {
        add(bag, noiseGesture(ctx, out, t + i * 0.085, {
          dur: 0.17, type: 'white', filter: 'bandpass',
          freq: (620 + i * 340) * o.rate, freqEnd: (2500 + i * 700) * o.rate,
          q: 2.6, gain: 0.30 - i * 0.06, attack: 0.014, curve: 'swell', hold: 0.02, r: o.r, seed: 60 + i,
        }));
      }
      add(bag, voiceSyllable(ctx, out, t + 0.02, {
        f0: 300 * o.rate, f0End: 250 * o.rate, vowel: 'eh', dur: 0.09,
        gain: 0.20, attack: 0.01, release: 0.06, breath: 0.4, r: o.r,
      }));
      return bag;
    },
  },

  roll: {
    g: 0.55, dur: 0.55, gap: 0.15, max: 2, pri: 1, ref: 6, vary: 0.05,
    build(ctx, out, t, o) {
      const bag = bagOf(t);
      // Three soft body contacts as he goes over, plus continuous cloth.
      for (let i = 0; i < 3; i++) {
        const at = t + i * 0.11;
        add(bag, thump(ctx, out, at, { f0: (150 - i * 12) * o.rate, f1: 55, pitchDur: 0.035, dur: 0.09, gain: 0.30 - i * 0.05, attack: 0.002 }));
        add(bag, noiseGesture(ctx, out, at, { dur: 0.07, filter: 'bandpass', freq: 1500 * o.rate, q: 1.0, gain: 0.16, attack: 0.004, r: o.r, seed: 70 + i }));
      }
      add(bag, noiseGesture(ctx, out, t, {
        dur: 0.26, type: 'pink', filter: 'highpass', freq: 1400, gain: 0.11,
        attack: 0.03, curve: 'swell', hold: 0.06, r: o.r, seed: 74,
      }));
      return bag;
    },
  },

  /* ===================== Sly — cane ==================================== */

  /** Whoosh tightens and rises through the 3-hit combo — the ear reads it as speed. */
  cane_swing: {
    g: 0.6, dur: 0.4, gap: 0.05, max: 3, pri: 2, ref: 7, flat: false, vary: 0.05,
    build(ctx, out, t, o) {
      const i = Math.max(0, Math.min(2, (o.index || 1) - 1));
      const dur = [0.24, 0.20, 0.165][i];
      const f0 = [520, 640, 800][i];
      const f1 = [2300, 2900, 3800][i];
      const bag = bagOf(t);
      add(bag, noiseGesture(ctx, out, t, {
        dur, type: 'white', filter: 'bandpass', freq: f0 * o.rate, freqEnd: f1 * o.rate,
        q: 1.9 + i * 0.5, gain: 0.42 + i * 0.05, attack: dur * 0.55, curve: 'swell', hold: 0.005,
        r: o.r, seed: 80 + i,
      }));
      // A faint metallic whistle off the cane's hook — it is a brass crook, after all.
      const w = osc(ctx, 'sine', 1500 * o.rate);
      glide(w.frequency, t, 1500 * o.rate, 2900 * o.rate, dur);
      const wg = gain(ctx, 0);
      const end = swell(wg.gain, t, dur * 0.6, 0.01, dur * 0.35, 0.045);
      w.connect(wg).connect(out);
      w.start(t); w.stop(end);
      bag.srcs.push(w);
      if (end > bag.end) bag.end = end;
      return bag;
    },
  },

  /** Cane on stone: bright metallic transient over a body thump. Attack must be instant. */
  cane_hit: {
    g: 0.9, dur: 0.6, gap: 0.03, max: 4, pri: 3, ref: 10, duck: 0.16, vary: 0.05,
    build(ctx, out, t, o) {
      const bag = bagOf(t);
      const i = Math.max(0, Math.min(2, (o.index || 1) - 1));
      add(bag, metal(ctx, out, t, {
        base: (760 + i * 90) * o.rate, dur: 0.34 + i * 0.06, gain: 0.30, hp: 1500,
        count: 6, spread: 1.0, decayTilt: 0.6, attack: 0.0006,
      }));
      add(bag, noiseGesture(ctx, out, t, { dur: 0.018, filter: 'highpass', freq: 3200, gain: 0.34, attack: 0.0005, r: o.r, seed: 90 }));
      add(bag, thump(ctx, out, t, { f0: (175 + i * 20) * o.rate, f1: 62, pitchDur: 0.035, dur: 0.14 + i * 0.03, gain: 0.6, attack: 0.0008 }));
      if (i === 2) {   // the finisher lands harder
        add(bag, thump(ctx, out, t, { f0: 90, f1: 38, pitchDur: 0.07, dur: 0.26, gain: 0.5, attack: 0.001 }));
      }
      return bag;
    },
  },

  /** Cane Slam. Low boom, dirt, and a shower of debris settling after it. */
  dive_boom: {
    /* g was 1.0 and the recipe rendered a peak of 1.021 — the sub-voices' transients land
       together, so the sum overshot the gain the mixer had budgeted for it. Backed off to the
       measured headroom rather than left for the limiter to clean up. */
    g: 0.97, dur: 1.2, gap: 0.15, max: 2, pri: 3, ref: 16, duck: 0.35, vary: 0.04,
    build(ctx, out, t, o) {
      const bag = bagOf(t);
      add(bag, thump(ctx, out, t, { f0: 120 * o.rate, f1: 33, pitchDur: 0.11, dur: 0.5, gain: 0.95, attack: 0.001 }));
      add(bag, thump(ctx, out, t + 0.005, { f0: 260, f1: 70, pitchDur: 0.05, dur: 0.2, gain: 0.4, attack: 0.001, type: 'triangle' }));
      add(bag, noiseGesture(ctx, out, t, { dur: 0.28, filter: 'lowpass', freq: 700 * o.rate, q: 1.2, gain: 0.55, attack: 0.0008, r: o.r, seed: 100 }));
      add(bag, noiseGesture(ctx, out, t, { dur: 0.05, filter: 'highpass', freq: 2600, gain: 0.26, attack: 0.0006, r: o.r, seed: 101 }));
      // Debris: grains raining down over the next half second, thinning out.
      for (let i = 0; i < 9; i++) {
        const at = t + 0.06 + i * 0.045 + o.r() * 0.05;
        add(bag, noiseGesture(ctx, out, at, {
          dur: 0.028, filter: 'bandpass', freq: 1800 + o.r() * 3500, q: 7,
          gain: 0.075 * (1 - i / 11), attack: 0.0008, r: o.r, seed: 102 + i,
        }));
      }
      return bag;
    },
  },

  /* ===================== Sly — traversal ============================== */

  /** Rail slide. Continuous; brightness and the metal ring both track speed. */
  rail_slide: {
    g: 0.5, dur: 0, loop: true, gap: 0, max: 1, pri: 2, ref: 6, vary: 0,
    build(ctx, out, t, o) {
      const nz = noise(ctx, 'white', o.r, 4, 111);
      const band = bq(ctx, 'bandpass', 1400, 2.2);
      const hp = bq(ctx, 'highpass', 500, 0.7);
      const g = gain(ctx, 0);
      chain(nz, band, hp, g).connect(out);
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(0.55, t + 0.06);

      // The rail itself singing — a thin resonant tone riding the friction noise.
      const ring = osc(ctx, 'sawtooth', 1180);
      const rf = bq(ctx, 'bandpass', 1180, 12);
      const rg = gain(ctx, 0);
      chain(ring, rf, rg).connect(out);
      rg.gain.setValueAtTime(0, t);
      rg.gain.linearRampToValueAtTime(0.05, t + 0.12);

      startAt(nz, t);
      ring.start(t);

      return {
        end: Infinity,
        srcs: [nz, ring],
        set(key, v, when) {
          if (key !== 'speed') return;
          const s = Math.max(0, Math.min(1, v));
          band.frequency.setTargetAtTime(700 + s * 3600, when, 0.05);
          hp.frequency.setTargetAtTime(360 + s * 700, when, 0.08);
          g.gain.setTargetAtTime(0.22 + s * 0.55, when, 0.06);
          rf.frequency.setTargetAtTime(900 + s * 900, when, 0.09);
          ring.frequency.setTargetAtTime(900 + s * 900, when, 0.09);
          rg.gain.setTargetAtTime(0.015 + s * 0.07, when, 0.09);
        },
      };
    },
  },

  hook_catch: {
    g: 0.75, dur: 0.5, gap: 0.06, max: 2, pri: 2, ref: 9, vary: 0.05,
    build(ctx, out, t, o) {
      const bag = bagOf(t);
      add(bag, metal(ctx, out, t, { base: 1450 * o.rate, dur: 0.28, gain: 0.30, hp: 2400, count: 5, spread: 1.1 }));
      add(bag, metal(ctx, out, t + 0.012, { base: 2350 * o.rate, dur: 0.14, gain: 0.16, hp: 3200, count: 4, spread: 0.9 }));
      // The ring taking Sly's weight.
      add(bag, thump(ctx, out, t + 0.02, { f0: 240, f1: 130, pitchDur: 0.08, dur: 0.18, gain: 0.22, attack: 0.004, type: 'triangle' }));
      return bag;
    },
  },

  rope_creak: {
    g: 0.5, dur: 0.9, gap: 0.25, max: 2, pri: 1, ref: 6, vary: 0.07,
    build(ctx, out, t, o) {
      const bag = bagOf(t);
      // Stick-slip: a resonant saw whose pitch stumbles upward in irregular steps.
      const src = osc(ctx, 'sawtooth', 118 * o.rate);
      const f = bq(ctx, 'bandpass', 620 * o.rate, 8);
      const g = gain(ctx, 0);
      chain(src, f, g).connect(out);
      const end = swell(g.gain, t, 0.09, 0.22, 0.35, 0.30);
      let p = 118 * o.rate;
      src.frequency.setValueAtTime(p, t);
      for (let i = 1; i < 9; i++) {
        p *= 1 + o.r() * 0.09;
        src.frequency.setValueAtTime(p, t + i * 0.065 + o.r() * 0.02);
      }
      f.frequency.setValueAtTime(620 * o.rate, t);
      f.frequency.linearRampToValueAtTime(980 * o.rate, t + 0.55);
      src.start(t); src.stop(end);
      bag.srcs.push(src); bag.end = Math.max(bag.end, end);
      add(bag, noiseGesture(ctx, out, t, { dur: 0.4, type: 'pink', filter: 'bandpass', freq: 1500, q: 1.4, gain: 0.05, attack: 0.08, curve: 'swell', hold: 0.1, r: o.r, seed: 120 }));
      return bag;
    },
  },

  pole_scuff: {
    g: 0.45, dur: 0.45, gap: 0.12, max: 2, pri: 1, ref: 5, vary: 0.07,
    build(ctx, out, t, o) {
      const bag = bagOf(t);
      add(bag, noiseGesture(ctx, out, t, {
        dur: 0.30, type: 'pink', filter: 'bandpass', freq: 850 * o.rate, freqEnd: 1500 * o.rate,
        q: 2.4, gain: 0.34, attack: 0.03, curve: 'swell', hold: 0.05, r: o.r, seed: 130,
      }));
      add(bag, noiseGesture(ctx, out, t + 0.02, {
        dur: 0.22, filter: 'highpass', freq: 2200, gain: 0.10, attack: 0.05, curve: 'swell', hold: 0.03, r: o.r, seed: 131,
      }));
      return bag;
    },
  },

  /** Paraglide — wind in a stretched sheet, with the flutter that gives it fabric. */
  paraglide: {
    g: 0.5, dur: 0, loop: true, gap: 0, max: 1, pri: 2, ref: 4, flat: true, vary: 0,
    build(ctx, out, t, o) {
      const nz = noise(ctx, 'white', o.r, 4, 140);
      const band = bq(ctx, 'bandpass', 760, 1.1);
      const g = gain(ctx, 0);
      chain(nz, band, g).connect(out);
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(0.55, t + 0.35);

      const flutter = osc(ctx, 'sine', 7.3);
      const fg = gain(ctx, 0.22);
      flutter.connect(fg).connect(g.gain);
      const flutter2 = osc(ctx, 'sine', 2.1);
      const fg2 = gain(ctx, 260);
      flutter2.connect(fg2).connect(band.frequency);

      startAt(nz, t); flutter.start(t); flutter2.start(t);
      return {
        end: Infinity, srcs: [nz, flutter, flutter2],
        set(key, v, when) {
          if (key === 'speed') {
            const s = Math.max(0, Math.min(1, v));
            band.frequency.setTargetAtTime(500 + s * 900, when, 0.2);
            g.gain.setTargetAtTime(0.28 + s * 0.42, when, 0.2);
          }
        },
      };
    },
  },

  /* ===================== Sly — loot =================================== */

  /**
   * Pickpocket: cloth first, then the coin. That order is the whole gag — you hear
   * the hand in the pouch a beat before you hear what came out of it.
   */
  pickpocket: {
    g: 0.65, dur: 0.8, gap: 0.1, max: 2, pri: 2, ref: 6, vary: 0.05,
    build(ctx, out, t, o) {
      const bag = bagOf(t);
      for (let i = 0; i < 3; i++) {
        add(bag, noiseGesture(ctx, out, t + i * 0.055, {
          dur: 0.07, type: 'pink', filter: 'bandpass', freq: (2100 + i * 500) * o.rate, q: 1.1,
          gain: 0.20 - i * 0.03, attack: 0.012, r: o.r, seed: 150 + i,
        }));
      }
      add(bag, fmBell(ctx, out, t + 0.13, { freq: 1560 * o.rate, ratio: 2.76, index: 3.4, indexDecay: 0.05, dur: 0.42, gain: 0.24, attack: 0.001 }));
      add(bag, fmBell(ctx, out, t + 0.19, { freq: 2340 * o.rate, ratio: 2.76, index: 2.6, indexDecay: 0.04, dur: 0.30, gain: 0.15, attack: 0.001 }));
      return bag;
    },
  },

  /**
   * Coin. `streak` walks it up a major pentatonic ladder — the reward loop that
   * makes a player clear a whole courtyard of coins without being asked to.
   */
  coin: {
    g: 0.55, dur: 0.7, gap: 0.02, max: 6, pri: 2, ref: 8, flat: false, vary: 0,
    build(ctx, out, t, o) {
      const LADDER = [0, 2, 4, 7, 9, 12, 14, 16, 19, 21, 24, 26];
      const k = LADDER[Math.min(LADDER.length - 1, Math.max(0, o.streak | 0))];
      const f = 1046.5 * Math.pow(2, k / 12) * o.rate;
      const bag = bagOf(t);
      add(bag, fmBell(ctx, out, t, { freq: f, ratio: 3.51, index: 5.0, indexDecay: 0.035, dur: 0.42, gain: 0.30, attack: 0.0008 }));
      add(bag, fmBell(ctx, out, t + 0.008, { freq: f * 2, ratio: 2.0, index: 2.0, indexDecay: 0.03, dur: 0.24, gain: 0.12, attack: 0.0008 }));
      add(bag, noiseGesture(ctx, out, t, { dur: 0.012, filter: 'highpass', freq: 5200, gain: 0.10, attack: 0.0004, r: o.r, seed: 160 }));
      return bag;
    },
  },

  /** Clue bottle: glass, not metal. Longer, purer, with a shimmer that says "collect me". */
  clue_bottle: {
    g: 0.6, dur: 1.6, gap: 0.05, max: 3, pri: 2, ref: 10, vary: 0,
    build(ctx, out, t, o) {
      const bag = bagOf(t);
      const f = 1318.5 * o.rate;
      add(bag, fmBell(ctx, out, t, { freq: f, ratio: 2.4, index: 2.2, indexDecay: 0.06, dur: 1.15, gain: 0.26, attack: 0.001, tremolo: 5.2, tremDepth: 0.06 }));
      add(bag, fmBell(ctx, out, t + 0.05, { freq: f * 1.5, ratio: 4.1, index: 1.6, indexDecay: 0.05, dur: 0.85, gain: 0.13, attack: 0.001 }));
      add(bag, fmBell(ctx, out, t + 0.11, { freq: f * 2.0, ratio: 2.0, index: 1.0, indexDecay: 0.04, dur: 0.6, gain: 0.07, attack: 0.001 }));
      return bag;
    },
  },

  /* ===================== Sly — damage ================================= */

  hurt: {
    g: 0.7, dur: 0.6, gap: 0.2, max: 1, pri: 3, ref: 6, flat: true, duck: 0.25, vary: 0.04,
    build(ctx, out, t, o) {
      const bag = bagOf(t);
      add(bag, voiceSyllable(ctx, out, t, {
        f0: 300 * o.rate, f0End: 190 * o.rate, vowel: 'ah', vowelEnd: 'uh',
        dur: 0.19, gain: 0.5, attack: 0.006, release: 0.13, breath: 0.22, growl: 0.04, r: o.r,
      }));
      add(bag, thump(ctx, out, t, { f0: 130, f1: 52, pitchDur: 0.05, dur: 0.16, gain: 0.4, attack: 0.001 }));
      add(bag, noiseGesture(ctx, out, t, { dur: 0.06, filter: 'bandpass', freq: 1300, q: 0.9, gain: 0.16, attack: 0.001, r: o.r, seed: 170 }));
      return bag;
    },
  },

  ko: {
    /* g was 0.85 and the recipe rendered a peak of 1.246 (+1.9 dB over full scale): the body
       thump at +0.30 s lands inside the tail of the voice. The KO is the one sound in the game
       that must not distort, so the gain now matches what it actually renders. */
    g: 0.68, dur: 1.4, gap: 0.5, max: 1, pri: 3, ref: 8, flat: true, duck: 0.5, vary: 0.03,
    build(ctx, out, t, o) {
      const bag = bagOf(t);
      add(bag, voiceSyllable(ctx, out, t, {
        f0: 280 * o.rate, f0End: 120 * o.rate, vowel: 'ah', vowelEnd: 'oh',
        dur: 0.42, gain: 0.5, attack: 0.008, release: 0.25, breath: 0.25, growl: 0.05, r: o.r,
      }));
      add(bag, thump(ctx, out, t + 0.30, { f0: 110, f1: 34, pitchDur: 0.09, dur: 0.34, gain: 0.6, attack: 0.001 }));
      // The comic sting: a falling minor third on the vibes. Sly always gets up.
      add(bag, fmBell(ctx, out, t + 0.42, { freq: 392, ratio: 4, index: 2.4, indexDecay: 0.09, dur: 0.55, gain: 0.16, attack: 0.002, tremolo: 5.5, tremDepth: 0.25 }));
      add(bag, fmBell(ctx, out, t + 0.60, { freq: 329.6, ratio: 4, index: 2.4, indexDecay: 0.09, dur: 0.7, gain: 0.18, attack: 0.002, tremolo: 5.5, tremDepth: 0.25 }));
      return bag;
    },
  },

  /* ===================== World ======================================= */

  /** The wind bed. Height opens it up, enclosure shuts it down. */
  wind: {
    g: 0.5, dur: 0, loop: true, gap: 0, max: 1, pri: 3, ref: 1, flat: true, vary: 0,
    build(ctx, out, t, o) {
      const nz = noise(ctx, 'brown', o.r, 4, 200);
      const lp = bq(ctx, 'lowpass', 480, 0.9);
      const body = gain(ctx, 0);
      chain(nz, lp, body).connect(out);
      body.gain.setValueAtTime(0, t);
      body.gain.linearRampToValueAtTime(0.55, t + 2.0);

      // Gusts: two slow LFOs at incommensurate rates so the pattern never repeats.
      const g1 = osc(ctx, 'sine', 0.061);
      const gg1 = gain(ctx, 0.22);
      g1.connect(gg1).connect(body.gain);
      const g2 = osc(ctx, 'sine', 0.017);
      const gg2 = gain(ctx, 170);
      g2.connect(gg2).connect(lp.frequency);

      // The thin whistle over an edge — only audible up high, in the open.
      const wn = noise(ctx, 'white', o.r, 4, 201);
      const wf = bq(ctx, 'bandpass', 1150, 7);
      const wg = gain(ctx, 0);
      chain(wn, wf, wg).connect(out);
      const w1 = osc(ctx, 'sine', 0.043);
      const wgm = gain(ctx, 0.5);
      w1.connect(wgm).connect(wg.gain);

      startAt(nz, t); startAt(wn, t); g1.start(t); g2.start(t); w1.start(t);

      return {
        end: Infinity, srcs: [nz, wn, g1, g2, w1],
        set(key, v, when) {
          if (key === 'open') {              // 0 = sealed tomb, 1 = rooftop
            const s = Math.max(0, Math.min(1, v));
            body.gain.setTargetAtTime(0.10 + s * 0.62, when, 1.2);
            lp.frequency.setTargetAtTime(190 + s * 620, when, 1.5);
          } else if (key === 'height') {     // metres above the courtyard floor
            const h = Math.max(0, Math.min(1, v / 22));
            wg.gain.setTargetAtTime(0.006 + h * 0.055, when, 1.6);
            wf.frequency.setTargetAtTime(880 + h * 700, when, 2.0);
          }
        },
      };
    },
  },

  brazier: {
    g: 0.45, dur: 0, loop: true, gap: 0, max: 8, pri: 1, ref: 3.2, vary: 0.04,
    build(ctx, out, t, o) {
      const b = crackleBuffer(ctx, 5, 91 + ((o.variant | 0) * 13));
      const s = ctx.createBufferSource();
      s.buffer = b; s.loop = true;
      s.loopEnd = b.duration - 0.13;          // stay inside the crossfaded region
      s.playbackRate.value = 0.92 + o.r() * 0.16;
      const hp = bq(ctx, 'highpass', 280, 0.6);
      const g = gain(ctx, 0);
      chain(s, hp, g).connect(out);
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(0.5, t + 0.8);
      // The low roar under the crackle — fire has a body, not just a hiss.
      const rn = noise(ctx, 'brown', o.r, 4, 210);
      const rf = bq(ctx, 'lowpass', 300, 1.0);
      const rg = gain(ctx, 0);
      chain(rn, rf, rg).connect(out);
      rg.gain.setValueAtTime(0, t);
      rg.gain.linearRampToValueAtTime(0.28, t + 1.0);
      const flick = osc(ctx, 'sine', 0.7 + o.r() * 0.5);
      const fg = gain(ctx, 0.11);
      flick.connect(fg).connect(rg.gain);
      s.start(t, o.r() * (b.duration - 0.5));
      startAt(rn, t); flick.start(t);
      return { end: Infinity, srcs: [s, rn, flick] };
    },
  },

  torch_whoosh: {
    g: 0.7, dur: 0.8, gap: 0.1, max: 3, pri: 1, ref: 8, vary: 0.06,
    build(ctx, out, t, o) {
      const bag = bagOf(t);
      add(bag, noiseGesture(ctx, out, t, {
        dur: 0.34, type: 'white', filter: 'bandpass', freq: 260 * o.rate, freqEnd: 1500 * o.rate,
        q: 0.9, gain: 0.5, attack: 0.05, curve: 'swell', hold: 0.03, r: o.r, seed: 220,
      }));
      add(bag, noiseGesture(ctx, out, t + 0.03, {
        dur: 0.45, type: 'brown', filter: 'lowpass', freq: 420, gain: 0.35,
        attack: 0.08, curve: 'swell', hold: 0.05, r: o.r, seed: 221,
      }));
      return bag;
    },
  },

  sand_shift: {
    g: 0.4, dur: 1.0, gap: 0.3, max: 2, pri: 0, ref: 7, vary: 0.08,
    build(ctx, out, t, o) {
      const bag = bagOf(t);
      add(bag, noiseGesture(ctx, out, t, {
        dur: 0.5, type: 'pink', filter: 'bandpass', freq: 1500 * o.rate, freqEnd: 700 * o.rate,
        q: 0.7, gain: 0.42, attack: 0.12, curve: 'swell', hold: 0.08, r: o.r, seed: 230,
      }));
      return bag;
    },
  },

  /** Distant birds: two or three chirps with a pitch arc, dulled by the air. */
  birds: {
    g: 0.3, dur: 1.2, gap: 1.0, max: 2, pri: 0, ref: 30, vary: 0.1,
    build(ctx, out, t, o) {
      const bag = bagOf(t);
      const n = 2 + ((o.variant | 0) % 3);
      const lp = bq(ctx, 'lowpass', 5200, 0.8);
      lp.connect(out);
      for (let i = 0; i < n; i++) {
        const at = t + i * (0.13 + o.r() * 0.09);
        const f = (2400 + o.r() * 1500) * o.rate;
        const c = osc(ctx, 'sine', f);
        c.frequency.setValueAtTime(f * 0.8, at);
        c.frequency.exponentialRampToValueAtTime(f * 1.25, at + 0.022);
        c.frequency.exponentialRampToValueAtTime(f * 0.86, at + 0.06);
        const g = gain(ctx, 0);
        const end = perc(g.gain, at, 0.055, 0.30, 0.006);
        c.connect(g).connect(lp);
        c.start(at); c.stop(end);
        bag.srcs.push(c);
        if (end > bag.end) bag.end = end;
      }
      return bag;
    },
  },

  water: {
    g: 0.4, dur: 0, loop: true, gap: 0, max: 2, pri: 1, ref: 22, vary: 0.03,
    build(ctx, out, t, o) {
      const b = waterBuffer(ctx, 6, 55);
      const s = ctx.createBufferSource();
      s.buffer = b; s.loop = true; s.loopEnd = b.duration - 0.26;
      s.playbackRate.value = 0.95 + o.r() * 0.1;
      const lp = bq(ctx, 'lowpass', 2200, 0.7);
      const g = gain(ctx, 0);
      chain(s, lp, g).connect(out);
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(0.6, t + 1.5);
      s.start(t, o.r() * 3);
      return { end: Infinity, srcs: [s] };
    },
  },

  stone_grind: {
    g: 0.85, dur: 1.8, gap: 0.4, max: 2, pri: 2, ref: 14, duck: 0.2, vary: 0.05,
    build(ctx, out, t, o) {
      const bag = bagOf(t);
      // Grit under a tonne of limestone: low rumble, resonant scrape, stuttering.
      add(bag, noiseGesture(ctx, out, t, {
        dur: 1.2, type: 'brown', filter: 'lowpass', freq: 260 * o.rate, gain: 0.55,
        attack: 0.12, curve: 'swell', hold: 0.5, r: o.r, seed: 240,
      }));
      const nz = noise(ctx, 'white', o.r, 4, 241);
      const f = bq(ctx, 'bandpass', 480 * o.rate, 6);
      const g = gain(ctx, 0);
      chain(nz, f, g).connect(out);
      const end = swell(g.gain, t, 0.1, 0.9, 0.35, 0.34);
      // Stick-slip judder — the reason a moving sarcophagus lid sounds heavy.
      const jud = osc(ctx, 'sawtooth', 17);
      const jg = gain(ctx, 0.16);
      jud.connect(jg).connect(g.gain);
      f.frequency.setValueAtTime(430 * o.rate, t);
      f.frequency.linearRampToValueAtTime(760 * o.rate, t + 1.2);
      startAt(nz, t); nz.stop(end); jud.start(t); jud.stop(end);
      bag.srcs.push(nz, jud);
      bag.end = Math.max(bag.end, end);
      return bag;
    },
  },

  /* ===================== Gadgets ===================================== */

  /** Binocucom: a beat-frequency warble and three data blips. Comic, not sci-fi. */
  binocucom: {
    g: 0.45, dur: 1.1, gap: 0.2, max: 1, pri: 2, ref: 2, flat: true, vary: 0,
    build(ctx, out, t, o) {
      const bag = bagOf(t);
      for (let i = 0; i < 2; i++) {
        const c = osc(ctx, 'sine', 618 + i * 15);
        const g = gain(ctx, 0);
        const end = swell(g.gain, t, 0.05, 0.42, 0.2, 0.10);
        c.connect(g).connect(out);
        c.start(t); c.stop(end);
        bag.srcs.push(c);
        bag.end = Math.max(bag.end, end);
      }
      for (let i = 0; i < 3; i++) {
        const at = t + 0.1 + i * 0.11;
        const b = osc(ctx, 'square', 1200 + i * 320);
        const g = gain(ctx, 0);
        const end = perc(g.gain, at, 0.05, 0.10, 0.002);
        const lp = bq(ctx, 'lowpass', 3200, 1);
        chain(b, lp, g).connect(out);
        b.start(at); b.stop(end);
        bag.srcs.push(b);
        bag.end = Math.max(bag.end, end);
      }
      return bag;
    },
  },

  /** Thief-o-Vision engaging: a rising sweep plus a sub swell. The world goes blue. */
  thief_on: {
    g: 0.6, dur: 1.0, gap: 0.1, max: 1, pri: 3, ref: 2, flat: true, vary: 0,
    build(ctx, out, t, o) {
      const bag = bagOf(t);
      const s = osc(ctx, 'sine', 220);
      glide(s.frequency, t, 220, 1650, 0.45);
      const g = gain(ctx, 0);
      const end = swell(g.gain, t, 0.06, 0.14, 0.30, 0.22);
      const bp = bq(ctx, 'bandpass', 1200, 1.4);
      chain(s, bp, g).connect(out);
      s.start(t); s.stop(end);
      bag.srcs.push(s); bag.end = Math.max(bag.end, end);

      add(bag, noiseGesture(ctx, out, t, {
        dur: 0.42, filter: 'bandpass', freq: 700, freqEnd: 4200, q: 3.2,
        gain: 0.16, attack: 0.18, curve: 'swell', hold: 0.05, r: o.r, seed: 250,
      }));
      add(bag, thump(ctx, out, t, { f0: 70, f1: 44, pitchDur: 0.3, dur: 0.45, gain: 0.3, attack: 0.04 }));
      add(bag, fmBell(ctx, out, t + 0.24, { freq: 1760, ratio: 3.0, index: 2.0, indexDecay: 0.05, dur: 0.5, gain: 0.10, attack: 0.002 }));
      return bag;
    },
  },

  thief_off: {
    g: 0.5, dur: 0.7, gap: 0.1, max: 1, pri: 3, ref: 2, flat: true, vary: 0,
    build(ctx, out, t, o) {
      const bag = bagOf(t);
      const s = osc(ctx, 'sine', 1500);
      glide(s.frequency, t, 1500, 260, 0.3);
      const g = gain(ctx, 0);
      const end = perc(g.gain, t, 0.3, 0.18, 0.01);
      const bp = bq(ctx, 'bandpass', 1000, 1.2);
      chain(s, bp, g).connect(out);
      s.start(t); s.stop(end);
      bag.srcs.push(s); bag.end = Math.max(bag.end, end);
      add(bag, noiseGesture(ctx, out, t, { dur: 0.26, filter: 'bandpass', freq: 3600, freqEnd: 600, q: 2.6, gain: 0.12, attack: 0.004, r: o.r, seed: 251 }));
      return bag;
    },
  },

  /* ===================== Guards ====================================== */

  armour_clank: {
    g: 0.6, dur: 0.7, gap: 0.06, max: 4, pri: 1, ref: 9, vary: 0.07,
    build(ctx, out, t, o) {
      const bag = bagOf(t);
      add(bag, metal(ctx, out, t, { base: (890 + (o.variant | 0) * 110) * o.rate, dur: 0.34, gain: 0.24, hp: 1300, count: 6, spread: 1.15 }));
      add(bag, metal(ctx, out, t + 0.035, { base: 1750 * o.rate, dur: 0.16, gain: 0.11, hp: 2400, count: 4, spread: 0.85 }));
      add(bag, thump(ctx, out, t, { f0: 200, f1: 90, pitchDur: 0.03, dur: 0.09, gain: 0.2, attack: 0.001, type: 'triangle' }));
      // Leather under the plate.
      add(bag, noiseGesture(ctx, out, t + 0.01, { dur: 0.14, type: 'pink', filter: 'bandpass', freq: 900, q: 1.6, gain: 0.09, attack: 0.02, r: o.r, seed: 260 }));
      return bag;
    },
  },

  spear_scrape: {
    g: 0.55, dur: 0.8, gap: 0.2, max: 2, pri: 1, ref: 9, vary: 0.06,
    build(ctx, out, t, o) {
      const bag = bagOf(t);
      const nz = noise(ctx, 'white', o.r, 4, 270);
      const f = bq(ctx, 'bandpass', 2100 * o.rate, 9);
      const g = gain(ctx, 0);
      chain(nz, f, g).connect(out);
      const end = swell(g.gain, t, 0.07, 0.3, 0.25, 0.30);
      f.frequency.setValueAtTime(1700 * o.rate, t);
      f.frequency.linearRampToValueAtTime(3100 * o.rate, t + 0.5);
      // Grit modulation — a scrape is a rapid series of tiny impacts.
      const grit = osc(ctx, 'sawtooth', 41);
      const gg = gain(ctx, 0.30);
      grit.connect(gg).connect(g.gain);
      startAt(nz, t); nz.stop(end); grit.start(t); grit.stop(end);
      bag.srcs.push(nz, grit); bag.end = Math.max(bag.end, end);
      add(bag, thump(ctx, out, t + 0.42, { f0: 170, f1: 80, pitchDur: 0.04, dur: 0.12, gain: 0.18, attack: 0.002, type: 'triangle' }));
      return bag;
    },
  },

  guard_yawn: {
    g: 0.55, dur: 1.3, gap: 0.4, max: 1, pri: 1, ref: 10, vary: 0.05,
    build(ctx, out, t, o) {
      const bag = bagOf(t);
      // Long inhale-ish rise, then the collapse. Vowel opens then closes: aaa-ooo.
      add(bag, voiceSyllable(ctx, out, t, {
        f0: 105 * o.rate, f0End: 145 * o.rate, vowel: 'oo', vowelEnd: 'ah',
        dur: 0.45, gain: 0.30, attack: 0.22, release: 0.05, breath: 0.4, growl: 0.03, r: o.r,
      }));
      add(bag, voiceSyllable(ctx, out, t + 0.46, {
        f0: 148 * o.rate, f0End: 88 * o.rate, vowel: 'ah', vowelEnd: 'oh',
        dur: 0.46, gain: 0.40, attack: 0.03, release: 0.2, breath: 0.3, growl: 0.05, r: o.r,
      }));
      return bag;
    },
  },

  guard_grunt: {
    g: 0.55, dur: 0.5, gap: 0.15, max: 2, pri: 1, ref: 10, vary: 0.06,
    build(ctx, out, t, o) {
      const bag = bagOf(t);
      add(bag, voiceSyllable(ctx, out, t, {
        f0: 132 * o.rate, f0End: 104 * o.rate, vowel: 'uh', vowelEnd: 'oh',
        dur: 0.16, gain: 0.5, attack: 0.012, release: 0.1, breath: 0.16, growl: 0.05, r: o.r,
      }));
      return bag;
    },
  },

  /** Comic mumble. Four nonsense syllables with a rising question contour. */
  guard_confused: {
    g: 0.55, dur: 1.4, gap: 0.4, max: 1, pri: 2, ref: 12, vary: 0.05,
    build(ctx, out, t, o) {
      const bag = bagOf(t);
      const VOW = ['uh', 'ah', 'oh', 'eh', 'oo'];
      let at = t;
      const base = 118 * o.rate;
      const n = 4;
      for (let i = 0; i < n; i++) {
        const rise = 1 + (i / (n - 1)) * 0.35;      // ends up on a question
        const d = 0.11 + o.r() * 0.09;
        add(bag, voiceSyllable(ctx, out, at, {
          f0: base * rise * (0.94 + o.r() * 0.12),
          f0End: base * rise * (i === n - 1 ? 1.4 : 0.92),
          vowel: VOW[(o.r() * VOW.length) | 0], vowelEnd: VOW[(o.r() * VOW.length) | 0],
          dur: d, gain: 0.34, attack: 0.018, release: 0.07, breath: 0.14, growl: 0.05, r: o.r,
        }));
        at += d + 0.055 + o.r() * 0.05;
      }
      return bag;
    },
  },

  guard_shout: {
    g: 0.8, dur: 0.8, gap: 0.3, max: 2, pri: 3, ref: 20, duck: 0.2, vary: 0.05,
    build(ctx, out, t, o) {
      const bag = bagOf(t);
      add(bag, voiceSyllable(ctx, out, t, {
        f0: 196 * o.rate, f0End: 232 * o.rate, vowel: 'eh', vowelEnd: 'ah',
        dur: 0.17, gain: 0.62, attack: 0.008, release: 0.06, breath: 0.2, growl: 0.06, r: o.r,
      }));
      add(bag, voiceSyllable(ctx, out, t + 0.25, {
        f0: 224 * o.rate, f0End: 150 * o.rate, vowel: 'ah', vowelEnd: 'oh',
        dur: 0.24, gain: 0.55, attack: 0.01, release: 0.14, breath: 0.24, growl: 0.07, r: o.r,
      }));
      return bag;
    },
  },

  /**
   * The SEARCHING rung — the one the ladder was missing.
   *
   * `src/ai/Patrol.js` grades detection `patrol → suspicious → searching → chase`, and until now
   * audio had a cue for the first, the second and the fourth. `searching` is the rung where the
   * guard has stopped asking and started hunting, and it is the most important one for the
   * player to hear, because it is the only one where he still has the option to leave.
   *
   * So it must not be `alert_sting` quieter. That sting is a cluster stab that says *caught*.
   * This says *hunting*: a falling minor third on the muted trumpet (the classic "come out"
   * two-note call), a frame-drum doum underneath, and a suspended fifth left hanging with no
   * resolution. Nothing here is a semitone and nothing here is loud — the tension is that the
   * phrase does not finish.
   */
  search_call: {
    g: 0.7, dur: 1.5, gap: 0.5, max: 1, pri: 3, ref: 2, flat: true, duck: 0.30, vary: 0,
    build(ctx, out, t, o) {
      const bag = bagOf(t);
      const wave = pulseWave(ctx, 0.14, 40);
      // The two-note call: G5 down to E5, a minor third, the shape of a search whistle.
      const CALL = [[783.99, 0.0, 0.26], [659.25, 0.30, 0.42]];
      for (const [f, at, dur] of CALL) {
        const s = osc(ctx, wave, f);
        s.frequency.setValueAtTime(f * 0.985, t + at);
        s.frequency.exponentialRampToValueAtTime(f, t + at + 0.04);
        const bp = bq(ctx, 'bandpass', 1250, 2.4);
        const g = gain(ctx, 0);
        const end = perc(g.gain, t + at, dur, 0.30, 0.02);
        chain(s, bp, g).connect(out);
        s.start(t + at); s.stop(end);
        bag.srcs.push(s); bag.end = Math.max(bag.end, end);
      }
      // Frame drum: two hits, the second late, so the pulse feels like footsteps closing.
      add(bag, thump(ctx, out, t + 0.02, { f0: 98, f1: 60, pitchDur: 0.05, dur: 0.26, gain: 0.42, attack: 0.0018 }));
      add(bag, thump(ctx, out, t + 0.56, { f0: 92, f1: 56, pitchDur: 0.05, dur: 0.30, gain: 0.34, attack: 0.0018 }));
      // The unresolved fifth underneath — a pedal that never lands anywhere.
      for (const f of [146.83, 220]) {
        const s = osc(ctx, 'triangle', f);
        const g = gain(ctx, 0);
        const end = swell(g.gain, t, 0.18, 0.30, 0.55, 0.13);
        chain(s, bq(ctx, 'lowpass', 900, 0.7), g).connect(out);
        s.start(t); s.stop(end);
        bag.srcs.push(s); bag.end = Math.max(bag.end, end);
      }
      // Finger cymbals — the Egyptian half of the palette, and a real instrument cue.
      add(bag, metal(ctx, out, t + 0.30, { base: 2450, dur: 0.7, gain: 0.075, hp: 3800, count: 4, spread: 1.2, decayTilt: 0.15 }));
      return bag;
    },
  },

  /**
   * The alert sting. Cluster stab (minor 2nd — the most alarming interval there is),
   * a rising whole-tone run, timpani and a cymbal. Ducks the score hard so it lands.
   */
  alert_sting: {
    g: 0.85, dur: 1.6, gap: 0.6, max: 1, pri: 3, ref: 2, flat: true, duck: 0.55, vary: 0,
    build(ctx, out, t, o) {
      const bag = bagOf(t);
      const wave = pulseWave(ctx, 0.16, 40);
      // Two brass voices a semitone apart.
      for (const f of [440, 466.16]) {
        const s = osc(ctx, wave, f);
        const bp = bq(ctx, 'bandpass', 1250, 2.2);
        const g = gain(ctx, 0);
        const end = perc(g.gain, t, 0.42, 0.20, 0.006);
        s.frequency.setValueAtTime(f * 0.96, t);
        s.frequency.exponentialRampToValueAtTime(f, t + 0.045);   // a hard scoop into the note
        chain(s, bp, g).connect(out);
        s.start(t); s.stop(end);
        bag.srcs.push(s); bag.end = Math.max(bag.end, end);
      }
      // Whole-tone run upward — unstable, unresolved, panic.
      const RUN = [587.33, 659.25, 739.99, 830.61, 932.33];
      for (let i = 0; i < RUN.length; i++) {
        const at = t + 0.34 + i * 0.052;
        const s = osc(ctx, wave, RUN[i]);
        const bp = bq(ctx, 'bandpass', 1500, 2.0);
        const g = gain(ctx, 0);
        const end = perc(g.gain, at, 0.16, 0.13, 0.004);
        chain(s, bp, g).connect(out);
        s.start(at); s.stop(end);
        bag.srcs.push(s); bag.end = Math.max(bag.end, end);
      }
      add(bag, thump(ctx, out, t, { f0: 165, f1: 58, pitchDur: 0.08, dur: 0.45, gain: 0.6, attack: 0.002 }));
      add(bag, thump(ctx, out, t + 0.6, { f0: 140, f1: 52, pitchDur: 0.08, dur: 0.5, gain: 0.45, attack: 0.002 }));
      add(bag, metal(ctx, out, t, { base: 480, dur: 1.0, gain: 0.14, hp: 3600, count: 6, spread: 1.3, decayTilt: 0.2 }));
      return bag;
    },
  },
};

/** Names, for the analysis harness and for anyone enumerating the catalogue. */
export const SFX_NAMES = Object.keys(SFX);

/**
 * Footstep name for a COLLISION surface tag (AGENTS.md §4.4 `material`).
 *
 * `water` is in here because the level authors one: `src/world` tags the Nile geometry `water`,
 * and until this line existed every step taken in the river played `step_stone`. The default is
 * still stone — that is the right guess for an unlabelled surface in a temple — but a tag the
 * world actually emits should never reach the default.
 */
export const STEP_SURFACES = ['sand', 'stone', 'wood', 'metal', 'cloth', 'water'];

export function stepFor(material) {
  switch (material) {
    case 'sand': return 'step_sand';
    case 'wood': return 'step_wood';
    case 'metal': return 'step_metal';
    case 'cloth': return 'step_cloth';
    case 'water': return 'step_water';
    default: return 'step_stone';
  }
}

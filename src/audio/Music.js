import { rng, WORLD_SEED } from '../core/Rand.js';
import {
  gain, bq, osc, noise, chain, startAt, perc, swell, adsr, glide,
  noiseGesture, thump, metal, fmBell, karplusBuffer, pulseWave, warmWave,
} from './Synth.js';

/**
 * Music — the procedural score.
 *
 * The idiom is Sly's: cool jazz heist caper — walking upright bass, brushed kit,
 * muted trumpet stabs, vibraphone, finger snaps — crossed with Egyptian modal
 * colour. The two halves meet on the dominant: the V7♭9 of D minor spells
 * A B♭ C♯ D E F G, which is simultaneously a jazz altered dominant and a Hijaz
 * maqam. The bar where the harmony is most jazz is the bar where it is most
 * Egyptian, and no seam is required.
 *
 * **Generative, not random.** Form and progression are fixed. Only *which* of the
 * scale-appropriate options gets played varies, and every choice draws from
 * `rng(seed + bar)` (AGENTS.md §1). Same seed, same performance; different bars,
 * different performance. It cannot play a wrong note because it is never offered
 * one.
 *
 * Scheduling is look-ahead: `update(now)` generates whole bars ~0.4 s before they
 * sound. Sections therefore change *on the bar line* and crossfade across one bar
 * rather than cutting, which is the difference between a score and a jukebox.
 */

/* ---------------------------------------------------------------------------
   Theory
--------------------------------------------------------------------------- */

const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);

// Scale shapes as semitone offsets from the chord root.
const DORIAN   = [0, 2, 3, 5, 7, 9, 10];
const AEOLIAN  = [0, 2, 3, 5, 7, 8, 10];
const LYDIAN   = [0, 2, 4, 6, 7, 9, 11];
const LYDDOM   = [0, 2, 4, 6, 7, 9, 10];
const MIXO     = [0, 2, 4, 5, 7, 9, 10];
const PHRYGIAN = [0, 1, 3, 5, 7, 8, 10];
/** Hijaz / phrygian dominant — the flat-2 + major-3 gap that *is* the Egypt sound. */
const HIJAZ    = [0, 1, 4, 5, 7, 8, 10];

const ch = (root, chord, scale, label) => ({ root, chord, scale, label });

/** Home form: D minor caper. bII (E♭maj7) for noir, V7♭9 in Hijaz for Egypt. */
const FORM_A = [
  ch(2,  [0, 3, 7, 9],      DORIAN,  'Dm6/9'),
  ch(2,  [0, 3, 7, 9],      DORIAN,  'Dm6/9'),
  ch(3,  [0, 4, 7, 11],     LYDIAN,  'Ebmaj7#11'),
  ch(3,  [0, 4, 7, 11],     LYDIAN,  'Ebmaj7#11'),
  ch(2,  [0, 3, 7, 9],      DORIAN,  'Dm6/9'),
  ch(7,  [0, 3, 7, 10],     DORIAN,  'Gm7'),
  ch(9,  [0, 4, 7, 10, 13], HIJAZ,   'A7b9'),
  ch(9,  [0, 4, 7, 10, 13], HIJAZ,   'A7b9'),
];

/** Chase: same key, harder harmonic rhythm, a tritone-sub sting in bar 5. */
const FORM_B = [
  ch(2,  [0, 3, 7, 10],     DORIAN,  'Dm7'),
  ch(2,  [0, 3, 7, 10],     DORIAN,  'Dm7'),
  ch(7,  [0, 3, 7, 10],     DORIAN,  'Gm7'),
  ch(7,  [0, 3, 7, 10],     DORIAN,  'Gm7'),
  ch(10, [0, 4, 7, 10],     LYDDOM,  'Bb7#11'),
  ch(9,  [0, 4, 7, 10, 15], HIJAZ,   'A7#9'),
  ch(2,  [0, 3, 7, 10],     DORIAN,  'Dm7'),
  ch(9,  [0, 4, 7, 10, 13], HIJAZ,   'A7b9'),
];

/** Alert: four bars that refuse to resolve. Dominant pedal with a chromatic wobble. */
const FORM_ALERT = [
  ch(9,  [0, 4, 7, 10, 13], HIJAZ,   'A7b9'),
  ch(9,  [0, 4, 7, 10, 13], HIJAZ,   'A7b9'),
  ch(10, [0, 4, 7, 10],     LYDDOM,  'Bb7#11'),
  ch(9,  [0, 4, 7, 10, 13], HIJAZ,   'A7b9'),
];

/** Treasure: the parallel major finally arrives. Lydian, so it glitters. */
const FORM_TREASURE = [
  ch(2,  [0, 4, 7, 11, 14], LYDIAN,  'Dmaj9#11'),
  ch(2,  [0, 4, 7, 11, 14], LYDIAN,  'Dmaj9#11'),
  ch(11, [0, 3, 7, 10],     AEOLIAN, 'Bm7'),
  ch(7,  [0, 4, 7, 11],     LYDIAN,  'Gmaj7'),
  ch(2,  [0, 4, 7, 11, 14], LYDIAN,  'Dmaj9#11'),
  ch(6,  [0, 3, 7, 10],     PHRYGIAN,'F#m7'),
  ch(7,  [0, 4, 7, 11],     LYDIAN,  'Gmaj7'),
  ch(9,  [0, 5, 7, 10],     MIXO,    'A7sus'),
];

/* A `FORM_MENU` lived here — four bars, `Dm(add9) | Dm(add9) | Ebmaj7 | Ebmaj7`, feeding a
   `menu` section at 88 bpm in a `sparse` style with the kit muted and the vibes forward. It was
   **unreachable**: `setSection` is only ever called from `Audio.music()`, which is only ever fed
   by `_wantSection()`, which returns `explore` / `sneak` / `alert` / `chase` and nothing else —
   and `grep -rn "'menu'|pauseMenu|mainMenu|titleScreen" src/` finds **no menu anywhere in this
   project**, so there was no caller to connect it to either. It rendered fine (10 s at seed
   0x5c17c00: peak 0.223, rms 0.0218) and no player could ever hear it.
   Deleted rather than wired, because the thing it was written for does not exist. Its style
   `sparse` went with it, which is why seven `style === 'sparse'` conditions across `_bass`,
   `_kit`, `_perc`, `_oud` and `_lead` are gone too — with `menu` removed nothing produced that
   style, so every one of them was provably unreachable. If a title screen is ever built, this
   comment is the recipe: four bars of Dorian add9 into Lydian maj7, kit at 0, vibes at 0.75. */

/**
 * A section is a form plus an arrangement. Layer weights are the mix; `style`
 * selects the rhythmic language each generator plays in.
 */
export const SECTIONS = {
  explore:  { bpm: 100, swing: 0.62, form: FORM_A,        style: 'walk',
              layers: { bass: 0.85, kit: 0.52, perc: 0.28, vibes: 0.58, lead: 0.34, oud: 0.40, pad: 0.18 } },
  sneak:    { bpm: 100, swing: 0.62, form: FORM_A,        style: 'sneak',
              layers: { bass: 0.66, kit: 0.16, perc: 0.40, vibes: 0.34, lead: 0.00, oud: 0.30, pad: 0.34 } },
  alert:    { bpm: 104, swing: 0.56, form: FORM_ALERT,    style: 'alert',
              layers: { bass: 0.90, kit: 0.62, perc: 0.55, vibes: 0.22, lead: 0.48, oud: 0.36, pad: 0.38 } },
  chase:    { bpm: 112, swing: 0.58, form: FORM_B,        style: 'chase',
              layers: { bass: 1.00, kit: 0.92, perc: 0.70, vibes: 0.38, lead: 0.68, oud: 0.58, pad: 0.14 } },
  treasure: { bpm: 96,  swing: 0.62, form: FORM_TREASURE, style: 'treasure',
              layers: { bass: 0.70, kit: 0.40, perc: 0.24, vibes: 0.92, lead: 0.50, oud: 0.52, pad: 0.50 } },
};

export const SECTION_NAMES = Object.keys(SECTIONS);

const LAYER_NAMES = ['bass', 'kit', 'perc', 'vibes', 'lead', 'oud', 'pad'];

/** Per-layer trim, set once by ear-equivalent (measured RMS) rather than guessed live. */
const TRIM = { bass: 0.62, kit: 0.42, perc: 0.40, vibes: 0.34, lead: 0.30, oud: 0.36, pad: 0.22 };

/* ---------------------------------------------------------------------------
   Pitch utilities. Module-scope scratch so bar generation doesn't churn arrays.
--------------------------------------------------------------------------- */

const _cand = new Int16Array(64);

/** The midi note of pitch-class `pc` nearest `prev`, inside [lo,hi]. Voice leading in one line. */
function nearPc(pc, prev, lo, hi) {
  pc = ((pc % 12) + 12) % 12;
  let best = lo, bd = 1e9;
  for (let m = lo; m <= hi; m++) {
    if (m % 12 !== pc) continue;
    const d = Math.abs(m - prev);
    if (d < bd) { bd = d; best = m; }
  }
  return best;
}

/** Fill `_cand` with every midi note in [lo,hi] belonging to root+offsets. Returns count. */
function collect(root, offsets, lo, hi) {
  let n = 0;
  for (let i = 0; i < offsets.length && n < 64; i++) {
    const pc = ((root + offsets[i]) % 12 + 12) % 12;
    for (let m = lo; m <= hi && n < 64; m++) if (m % 12 === pc) _cand[n++] = m;
  }
  return n;
}

/**
 * Choose a note from the candidate set, biased toward stepwise motion from `prev`.
 * Melodies that leap at random sound like arpeggiator output; melodies that step
 * sound like someone playing.
 */
function chooseNear(n, prev, r, maxLeap = 5) {
  let count = 0;
  for (let i = 0; i < n; i++) if (Math.abs(_cand[i] - prev) <= maxLeap) count++;
  if (count === 0) {                      // nothing close — take the nearest, wherever it is
    let best = _cand[0], bd = 1e9;
    for (let i = 0; i < n; i++) { const d = Math.abs(_cand[i] - prev); if (d < bd) { bd = d; best = _cand[i]; } }
    return best;
  }
  let k = Math.floor(r() * count);
  for (let i = 0; i < n; i++) {
    if (Math.abs(_cand[i] - prev) > maxLeap) continue;
    if (k-- === 0) return _cand[i];
  }
  return _cand[0];
}

/* ---------------------------------------------------------------------------
   Rhythm vocabulary. Positions are in beats; the swing grid bends the offbeats.
--------------------------------------------------------------------------- */

const LEAD_PHRASES = [
  [[0, 1.5], [1.5, 0.5], [2, 1.0]],
  [[0.5, 0.5], [1, 0.5], [1.5, 1.0], [3, 1.0]],
  [[1, 0.5], [1.5, 0.5], [2, 0.5], [2.5, 1.5]],
  [[0, 0.5], [0.5, 0.5], [1, 2.0]],
  [[2, 0.5], [2.5, 0.5], [3, 1.0]],
  [[0, 0.5], [0.5, 0.5], [1, 0.5], [1.5, 0.5], [2, 1.5]],
];

const COMP_PATTERNS = [
  [1.5, 3.0],
  [0.0, 2.5],
  [1.0, 2.5, 3.5],
  [0.5, 3.0],
  [2.0],
  [0.0, 1.5, 3.0],
];

/* ===========================================================================
   Music
=========================================================================== */

export class Music {
  constructor(ctx, destination, { seed = WORLD_SEED, lookahead = 0.45 } = {}) {
    this.ctx = ctx;
    this.seed = seed >>> 0;
    this.lookahead = lookahead;

    this.output = gain(ctx, 1);
    this.output.connect(destination);

    /** Layer buses. Section changes ramp these; the note generators never touch level. */
    this.layers = Object.create(null);
    for (const k of LAYER_NAMES) {
      const g = gain(ctx, 0);
      g.connect(this.output);
      this.layers[k] = g;
    }

    // A gentle band-shape across the whole score so it sits under dialogue-range SFX.
    this.tone = bq(ctx, 'highpass', 45, 0.7);
    this.tone.connect(this.output);

    this.section = 'explore';
    this._pending = null;
    this._bar = 0;
    this._barTime = 0;
    this._started = false;
    this._stopped = false;
    this._bpm = SECTIONS.explore.bpm;

    // Per-instrument memory so lines connect across bars instead of restarting.
    this._prevBass = 40;
    this._prevLead = 74;
    this._prevOud = 57;
    this._phraseCooldown = 0;
  }

  /** Seconds per bar at the current tempo. 4/4 throughout — it's a caper, not a puzzle. */
  get barSeconds() { return (60 / this._bpm) * 4; }

  start(now, section = this.section) {
    if (this._started) return;
    this._started = true;
    this._stopped = false;
    this.section = section;
    this._bpm = SECTIONS[section].bpm;
    this._bar = 0;
    this._barTime = now + 0.12;
    const L = SECTIONS[section].layers;
    for (const k of LAYER_NAMES) {
      const g = this.layers[k].gain;
      g.cancelScheduledValues(now);
      g.setValueAtTime(0, now);
      g.linearRampToValueAtTime((L[k] || 0) * TRIM[k], now + 1.4);
    }
  }

  /**
   * Request a section. The change lands on the next bar line and crossfades over a
   * full bar, so it reads as an arrangement change rather than a track swap.
   */
  setSection(name) {
    if (!SECTIONS[name] || name === this.section) return;
    this._pending = name;
  }

  /** Look-ahead scheduler. `now` is absolute context time. */
  update(now) {
    if (!this._started || this._stopped) return;
    const horizon = now + this.lookahead;
    let guard = 0;
    while (this._barTime < horizon && guard++ < 4) {
      // A section change applies from this bar: tempo, form and style all switch
      // together on the bar line, and the layer mix crossfades across the bar.
      if (this._pending) {
        const from = SECTIONS[this.section];
        const to = SECTIONS[this._pending];
        this.section = this._pending;
        this._pending = null;
        this._bpm = to.bpm;
        const t0 = this._barTime;
        const dur = (60 / to.bpm) * 4;
        for (const k of LAYER_NAMES) {
          const g = this.layers[k].gain;
          const target = (to.layers[k] || 0) * TRIM[k];
          g.cancelScheduledValues(t0);
          g.setValueAtTime(g.value, Math.max(t0 - 0.001, this.ctx.currentTime));
          g.linearRampToValueAtTime(target, t0 + dur);
        }
        // Mark the seam with a cymbal where the new section wants energy.
        if (to.layers.kit > from.layers.kit + 0.15) this._crash(t0, 0.5);
      }

      this._scheduleBar(this._bar, this._barTime);
      this._barTime += this.barSeconds;
      this._bar++;
    }
  }

  stop(fade = 1.5) {
    if (this._stopped) return;
    this._stopped = true;
    const t = this.ctx.currentTime;
    this.output.gain.cancelScheduledValues(t);
    this.output.gain.setValueAtTime(this.output.gain.value, t);
    this.output.gain.linearRampToValueAtTime(0, t + fade);
  }

  resume(now) {
    if (!this._stopped) return;
    this._stopped = false;
    this.output.gain.cancelScheduledValues(now);
    this.output.gain.setValueAtTime(this.output.gain.value, now);
    this.output.gain.linearRampToValueAtTime(1, now + 1.0);
    this._barTime = Math.max(this._barTime, now + 0.12);
  }

  dispose() {
    try { this.output.disconnect(); } catch {}
    for (const k of LAYER_NAMES) { try { this.layers[k].disconnect(); } catch {} }
  }

  /* ===================== bar generation ============================== */

  _scheduleBar(bar, t0) {
    const sec = SECTIONS[this.section];
    const form = sec.form;
    const chord = form[bar % form.length];
    const next = form[(bar + 1) % form.length];
    const beat = 60 / this._bpm;
    const swing = sec.swing;
    // Deterministic per-bar stream: replaying the same bar index replays the take.
    const r = rng(this.seed ^ (bar * 2654435761 + this.section.length * 7919));
    const first = bar % form.length === 0;

    this._bass(t0, beat, chord, next, r, sec.style);
    this._kit(t0, beat, swing, r, sec.style, first);
    this._perc(t0, beat, swing, r, sec.style);
    this._pad(t0, beat, chord, sec.style);
    this._vibes(t0, beat, swing, chord, r, sec.style);
    this._oud(t0, beat, swing, chord, r, sec.style);
    this._lead(t0, beat, swing, chord, r, sec.style);
  }

  /** Swing: the offbeat 8th lands late. 0.5 would be straight; ~0.62 is medium-up jazz. */
  _pos(t0, beat, swing, b) {
    const whole = Math.floor(b);
    const frac = b - whole;
    if (Math.abs(frac - 0.5) < 1e-6) return t0 + (whole + swing) * beat;
    return t0 + b * beat;
  }

  /* ---------------- bass: walking upright ---------------- */

  _bass(t0, beat, chord, next, r, style) {
    const out = this.layers.bass;
    const lo = 33, hi = 55;                       // A1 … G3, where an upright lives
    const sparse = style === 'sneak';

    if (sparse) {
      // Two half notes: root then fifth. Space is the point of a sneak cue.
      const a = nearPc(chord.root, this._prevBass, lo, hi);
      this._bassNote(out, t0, a, beat * 1.7, 0.85, this._prevBass);
      const b = nearPc(chord.root + 7, a, lo, hi);
      this._bassNote(out, t0 + beat * 2, b, beat * 1.7, 0.7, a);
      this._prevBass = b;
      return;
    }

    let prev = this._prevBass;
    for (let i = 0; i < 4; i++) {
      let m;
      if (i === 0) {
        m = nearPc(chord.root, prev, lo, hi);
      } else if (i === 3) {
        // Beat 4 is the hinge: approach the next bar's root by a semitone. This one
        // rule is most of what makes a walking line sound like jazz and not like scales.
        const dir = r.chance(0.5) ? 1 : -1;
        m = nearPc(next.root + dir, prev, lo, hi);
        if (Math.abs(m - prev) > 6) m = nearPc(next.root - dir, prev, lo, hi);
      } else {
        const n = collect(chord.root, i === 1 ? chord.chord : chord.scale, lo, hi);
        m = chooseNear(n, prev, r, 5);
        if (m === prev) m = nearPc(chord.root + (r.chance(0.5) ? 7 : 3), prev, lo, hi);
      }
      const swung = style === 'chase' && i === 3 && r.chance(0.35);
      this._bassNote(out, t0 + i * beat, m, beat * 0.82, i === 0 ? 1.0 : 0.82, prev);
      if (swung) this._bassNote(out, t0 + (i + 0.5) * beat, nearPc(next.root, m, lo, hi), beat * 0.4, 0.55, m);
      prev = m;
    }
    this._prevBass = prev;
  }

  /**
   * Upright bass: saw + triangle through a low filter, a fast filter blip for the
   * finger, and a short portamento off the previous note. Real uprights slide
   * because the player's hand has to travel; without it the line sounds fretted.
   */
  _bassNote(out, t, midi, dur, vel, fromMidi) {
    const ctx = this.ctx;
    const f = mtof(midi);
    const body = osc(ctx, 'sawtooth', f);
    const sub = osc(ctx, 'triangle', f);
    const lp = bq(ctx, 'lowpass', 420, 3.2);
    const vca = gain(ctx, 0);
    const subg = gain(ctx, 0.55);

    if (fromMidi && Math.abs(fromMidi - midi) <= 7) {
      const ff = mtof(fromMidi);
      body.frequency.setValueAtTime(ff, t - 0.012);
      body.frequency.exponentialRampToValueAtTime(f, t + 0.028);
      sub.frequency.setValueAtTime(ff, t - 0.012);
      sub.frequency.exponentialRampToValueAtTime(f, t + 0.028);
    }
    // Filter blip = the pluck. Amplitude alone gives you a synth bass.
    lp.frequency.setValueAtTime(1500, t);
    lp.frequency.exponentialRampToValueAtTime(380, t + 0.09);

    const end = adsr(vca.gain, t, dur, { a: 0.006, d: 0.13, s: 0.42, r: 0.10, peak: 0.55 * vel });
    body.connect(lp);
    sub.connect(subg).connect(lp);
    lp.connect(vca).connect(out);
    body.start(t); body.stop(end);
    sub.start(t); sub.stop(end);

    // Finger against the string — 8 ms of noise, and the whole thing reads as wood.
    noiseGesture(ctx, out, t, { dur: 0.03, filter: 'bandpass', freq: 1900, q: 1.6, gain: 0.05 * vel, attack: 0.001, seed: 900 });
  }

  /* ---------------- kit ---------------- */

  _kit(t0, beat, swing, r, style, firstBar) {
    const out = this.layers.kit;
    if (style === 'sneak') {
      this._brushSwirl(out, t0, beat * 3.6, 0.5);
      this._brushSlap(out, this._pos(t0, beat, swing, 1), 0.35, r);
      this._brushSlap(out, this._pos(t0, beat, swing, 3), 0.42, r);
      return;
    }

    if (style === 'alert') {
      // Toms climbing under the pedal. No backbeat — nothing here is comfortable.
      for (let i = 0; i < 8; i++) {
        const b = i * 0.5;
        const accent = i % 2 === 0 ? 0.75 : 0.42;
        this._tom(out, this._pos(t0, beat, swing, b), 150 - (i % 4) * 12, accent * (0.7 + (i / 8) * 0.5));
      }
      if (firstBar) this._crash(t0, 0.6);
      return;
    }

    if (style === 'chase') {
      // Swing ride: 1, 2, 2&, 3, 4, 4& — the pattern every jazz drummer plays.
      const RIDE = [0, 1, 1.5, 2, 3, 3.5];
      for (const b of RIDE) this._ride(out, this._pos(t0, beat, swing, b), b % 1 === 0 ? 0.55 : 0.34, r);
      this._kick(out, t0, 0.8);
      this._kick(out, this._pos(t0, beat, swing, 2 + (r.chance(0.5) ? 0 : 0.5)), 0.6);
      this._snare(out, t0 + beat, 0.7, r);
      this._snare(out, t0 + beat * 3, 0.75, r);
      if (r.chance(0.4)) this._snare(out, this._pos(t0, beat, swing, 2.5), 0.22, r);  // ghost
      if (firstBar) this._crash(t0, 0.55);
      return;
    }

    if (style === 'treasure') {
      this._brushSwirl(out, t0, beat * 3.6, 0.55);
      for (const b of [0, 1, 1.5, 2, 3, 3.5]) this._ride(out, this._pos(t0, beat, swing, b), b % 1 === 0 ? 0.3 : 0.2, r);
      this._brushSlap(out, t0 + beat, 0.3, r);
      this._brushSlap(out, t0 + beat * 3, 0.34, r);
      if (firstBar) this._crash(t0, 0.4);
      return;
    }

    /* explore — brushes, feathered kick, swing ride */
    this._brushSwirl(out, t0, beat * 3.6, 0.6);
    const RIDE = [0, 1, 1.5, 2, 3, 3.5];
    for (const b of RIDE) this._ride(out, this._pos(t0, beat, swing, b), b % 1 === 0 ? 0.38 : 0.24, r);
    this._brushSlap(out, t0 + beat, 0.42, r);
    this._brushSlap(out, t0 + beat * 3, 0.48, r);
    for (let i = 0; i < 4; i++) this._kick(out, t0 + i * beat, 0.16);   // feathered, felt not heard
    if (r.chance(0.22)) this._brushSlap(out, this._pos(t0, beat, swing, 3.5), 0.2, r);
  }

  /**
   * Brush swirl. The one place in this file where a slow attack is correct: a wire
   * brush dragged in a circle has no transient at all, and faking one with a
   * sharp envelope is instantly recognisable as a drum machine.
   */
  _brushSwirl(out, t, dur, vel) {
    const ctx = this.ctx;
    const nz = noise(ctx, 'pink', null, 4, 401);
    const bp = bq(ctx, 'bandpass', 2100, 0.75);
    const g = gain(ctx, 0);
    chain(nz, bp, g).connect(out);
    const end = swell(g.gain, t, dur * 0.42, dur * 0.1, dur * 0.48, 0.09 * vel);
    // Two circles per bar — the hand comes round, and the level breathes with it.
    const lfo = osc(ctx, 'sine', 2 / dur);
    const lg = gain(ctx, 0.028 * vel);
    lfo.connect(lg).connect(g.gain);
    lfo.start(t); lfo.stop(end);
    startAt(nz, t); nz.stop(end);
  }

  _brushSlap(out, t, vel, r) {
    const ctx = this.ctx;
    const j = r ? 1 + r.jitter(0.12) : 1;
    noiseGesture(ctx, out, t, { dur: 0.085 * j, filter: 'bandpass', freq: 2500 * j, q: 1.1, gain: 0.20 * vel, attack: 0.004, seed: 402 });
    noiseGesture(ctx, out, t, { dur: 0.05, filter: 'bandpass', freq: 320, q: 1.4, gain: 0.10 * vel, attack: 0.003, seed: 403 });
  }

  _snare(out, t, vel, r) {
    const ctx = this.ctx;
    const j = r ? 1 + r.jitter(0.1) : 1;
    noiseGesture(ctx, out, t, { dur: 0.10 * j, filter: 'highpass', freq: 1500, gain: 0.24 * vel, attack: 0.0012, seed: 404 });
    noiseGesture(ctx, out, t, { dur: 0.06, filter: 'bandpass', freq: 1900 * j, q: 0.8, gain: 0.16 * vel, attack: 0.001, seed: 405 });
    thump(ctx, out, t, { f0: 205 * j, f1: 150, pitchDur: 0.03, dur: 0.07, gain: 0.13 * vel, attack: 0.001, type: 'triangle' });
  }

  _kick(out, t, vel) {
    thump(this.ctx, out, t, { f0: 115, f1: 44, pitchDur: 0.05, dur: 0.20, gain: 0.55 * vel, attack: 0.0015 });
  }

  _tom(out, t, f, vel) {
    const ctx = this.ctx;
    thump(ctx, out, t, { f0: f, f1: f * 0.6, pitchDur: 0.07, dur: 0.22, gain: 0.34 * vel, attack: 0.0015, type: 'sine' });
    noiseGesture(ctx, out, t, { dur: 0.05, filter: 'bandpass', freq: f * 6, q: 1.2, gain: 0.05 * vel, attack: 0.001, seed: 406 });
  }

  _ride(out, t, vel, r) {
    const ctx = this.ctx;
    const j = r ? 1 + r.jitter(0.06) : 1;
    metal(ctx, out, t, { base: 372 * j, dur: 0.5, gain: 0.075 * vel, hp: 4200, count: 6, spread: 1.25, decayTilt: 0.35 });
    // The stick, without which a ride is a wash rather than a pulse.
    noiseGesture(ctx, out, t, { dur: 0.012, filter: 'highpass', freq: 6000, gain: 0.05 * vel, attack: 0.0006, seed: 407 });
  }

  _crash(t, vel) {
    const out = this.layers.kit;
    metal(this.ctx, out, t, { base: 300, dur: 1.6, gain: 0.11 * vel, hp: 3000, count: 6, spread: 1.5, decayTilt: 0.1 });
    noiseGesture(this.ctx, out, t, { dur: 1.2, filter: 'highpass', freq: 5200, gain: 0.05 * vel, attack: 0.002, seed: 408 });
  }

  /* ---------------- hand percussion + snaps ---------------- */

  _perc(t0, beat, swing, r, style) {
    const out = this.layers.perc;
    if (style === 'sneak') {
      // Finger snaps on 2 and 4. The most Sly sound there is.
      this._snap(out, this._pos(t0, beat, swing, 1), 0.85, r);
      this._snap(out, this._pos(t0, beat, swing, 3), 0.9, r);
      if (style === 'sneak' && r.chance(0.3)) this._tek(out, this._pos(t0, beat, swing, 2.5), 0.4, r);
      return;
    }
    if (style === 'chase' || style === 'alert') {
      // Maqsum: the backbone rhythm of Arabic popular music. D T . T D . T .
      const D = [0, 2], T = [0.5, 1.5, 3];
      for (const b of D) this._doum(out, this._pos(t0, beat, swing, b), 0.85, r);
      for (const b of T) this._tek(out, this._pos(t0, beat, swing, b), 0.6, r);
      if (r.chance(0.4)) this._tek(out, this._pos(t0, beat, swing, 3.5), 0.45, r);
      return;
    }
    if (style === 'treasure') {
      this._snap(out, this._pos(t0, beat, swing, 1), 0.6, r);
      this._snap(out, this._pos(t0, beat, swing, 3), 0.65, r);
      return;
    }
    /* explore */
    this._tek(out, this._pos(t0, beat, swing, 1.5), 0.5, r);
    this._doum(out, t0, 0.5, r);
    if (r.chance(0.5)) this._tek(out, this._pos(t0, beat, swing, 3.5), 0.45, r);
    if (r.chance(0.35)) this._snap(out, this._pos(t0, beat, swing, 3), 0.5, r);
  }

  _snap(out, t, vel, r) {
    const ctx = this.ctx;
    const j = r ? 1 + r.jitter(0.09) : 1;
    noiseGesture(ctx, out, t, { dur: 0.032 * j, filter: 'bandpass', freq: 1950 * j, q: 3.4, gain: 0.34 * vel, attack: 0.0007, seed: 410 });
    noiseGesture(ctx, out, t, { dur: 0.012, filter: 'highpass', freq: 4200, gain: 0.14 * vel, attack: 0.0005, seed: 411 });
  }

  _doum(out, t, vel, r) {
    const ctx = this.ctx;
    const j = r ? 1 + r.jitter(0.05) : 1;
    thump(ctx, out, t, { f0: 96 * j, f1: 62, pitchDur: 0.045, dur: 0.24, gain: 0.42 * vel, attack: 0.0015 });
    noiseGesture(ctx, out, t, { dur: 0.03, filter: 'bandpass', freq: 700, q: 1.2, gain: 0.07 * vel, attack: 0.001, seed: 412 });
  }

  _tek(out, t, vel, r) {
    const ctx = this.ctx;
    const j = r ? 1 + r.jitter(0.08) : 1;
    noiseGesture(ctx, out, t, { dur: 0.04 * j, filter: 'bandpass', freq: 2900 * j, q: 2.2, gain: 0.22 * vel, attack: 0.0008, seed: 413 });
    thump(ctx, out, t, { f0: 420 * j, f1: 260, pitchDur: 0.02, dur: 0.05, gain: 0.10 * vel, attack: 0.0008, type: 'triangle' });
  }

  /* ---------------- pad ---------------- */

  _pad(t0, beat, chord, style) {
    const out = this.layers.pad;
    const ctx = this.ctx;
    const dur = beat * 4;
    // Three voices, rootless, low-mid. Glue, never a feature — you should only
    // notice it when it stops.
    const wave = warmWave(ctx, 14);
    const voicing = [chord.chord[1] ?? 3, chord.chord[2] ?? 7, (chord.chord[3] ?? 10)];
    for (let i = 0; i < voicing.length; i++) {
      const midi = nearPc(chord.root + voicing[i], 58 + i * 5, 55, 74);
      const o = osc(ctx, wave, mtof(midi), i === 1 ? 4 : -3);
      const lp = bq(ctx, 'lowpass', 1400, 0.8);
      const g = gain(ctx, 0);
      chain(o, lp, g).connect(out);
      const end = swell(g.gain, t0, dur * 0.35, dur * 0.2, dur * 0.5, 0.085);
      o.start(t0); o.stop(end);
    }
  }

  /* ---------------- vibraphone ---------------- */

  _vibes(t0, beat, swing, chord, r, style) {
    const out = this.layers.vibes;
    const hits = r.pick(COMP_PATTERNS);
    const lo = 60, hi = 84;
    for (let h = 0; h < hits.length; h++) {
      const t = this._pos(t0, beat, swing, hits[h]);
      // Rootless voicing: 3rd, 7th, 9th. The root is the bass player's job.
      const tones = chord.chord.length > 3
        ? [chord.chord[1], chord.chord[3], chord.chord[2]]
        : [chord.chord[1], chord.chord[2], chord.chord[1] + 12];
      let prev = 66;
      for (let i = 0; i < tones.length; i++) {
        const midi = nearPc(chord.root + tones[i], prev + (i === 0 ? 0 : 4), lo, hi);
        prev = midi;
        const vel = (h === 0 ? 0.42 : 0.32) * (i === 0 ? 1 : 0.75);
        this._vibeNote(out, t + i * 0.008, midi, style === 'treasure' ? 2.1 : 1.5, vel);
      }
    }
    if (style === 'treasure') {
      // Glitter: an ascending arpeggio through the chord, because it's treasure.
      const n = collect(chord.root, chord.chord, 72, 96);
      for (let i = 0; i < Math.min(5, n); i++) {
        this._vibeNote(out, this._pos(t0, beat, swing, 2 + i * 0.25), _cand[i], 1.4, 0.22 - i * 0.02);
      }
    }
  }

  /**
   * Vibraphone: FM sine pair at a 4:1 ratio, which is the tuned first overtone of
   * a real vibraphone bar, plus the motor tremolo. The index envelope makes the
   * attack metallic and the sustain pure — that arc is the instrument.
   */
  _vibeNote(out, t, midi, dur, vel) {
    fmBell(this.ctx, out, t, {
      freq: mtof(midi), ratio: 4, index: 2.4, indexDecay: 0.085,
      dur, gain: 0.30 * vel, attack: 0.0025, tremolo: 5.4, tremDepth: 0.26,
    });
  }

  /* ---------------- oud ---------------- */

  _oud(t0, beat, swing, chord, r, style) {
    const out = this.layers.oud;
    const lo = 45, hi = 69;

    if (style === 'sneak') {
      const m = nearPc(chord.root, this._prevOud, lo, hi);
      this._oudNote(out, t0 + beat * 0.5, m, 0.75);
      if (r.chance(0.45)) {
        const m2 = nearPc(chord.root + 7, m, lo, hi);
        this._oudNote(out, this._pos(t0, beat, swing, 2.5), m2, 0.5);
        this._prevOud = m2;
      } else this._prevOud = m;
      return;
    }

    if (style === 'chase' || style === 'alert') {
      // A run through the mode. On the Hijaz bars this is the hook of the whole score.
      const n = collect(chord.root, chord.scale, lo, hi);
      let m = chooseNear(n, this._prevOud, r, 4);
      const start = r.chance(0.5) ? 0 : 2;
      const count = style === 'chase' ? 6 : 4;
      const dir = r.chance(0.6) ? 1 : -1;
      for (let i = 0; i < count; i++) {
        this._oudNote(out, this._pos(t0, beat, swing, start + i * 0.5), m, i === 0 ? 0.8 : 0.55);
        // Step through the mode rather than jumping: it's a run, not an arpeggio.
        let bestIdx = 0, bd = 1e9;
        for (let k = 0; k < n; k++) { const d = Math.abs(_cand[k] - m); if (d > 0 && d < bd) { bd = d; bestIdx = k; } }
        let nm = m;
        for (let k = 0; k < n; k++) {
          const cd = _cand[k] - m;
          if (dir > 0 && cd > 0 && (nm === m || _cand[k] < nm)) nm = _cand[k];
          if (dir < 0 && cd < 0 && (nm === m || _cand[k] > nm)) nm = _cand[k];
        }
        m = nm === m ? _cand[bestIdx] : nm;
      }
      this._prevOud = m;
      return;
    }

    if (style === 'treasure') {
      const n = collect(chord.root, chord.chord, lo, hi);
      for (let i = 0; i < Math.min(4, n); i++) {
        this._oudNote(out, this._pos(t0, beat, swing, i * 0.5), _cand[i], 0.55 - i * 0.05);
      }
      this._prevOud = _cand[Math.min(3, n - 1)];
      return;
    }

    /* explore — a short figure, and only sometimes, so it stays an accent */
    if (!r.chance(0.6)) return;
    const n = collect(chord.root, chord.scale, lo, hi);
    let m = chooseNear(n, this._prevOud, r, 4);
    const at = r.chance(0.5) ? 1.5 : 3;
    for (let i = 0; i < 3; i++) {
      this._oudNote(out, this._pos(t0, beat, swing, at + i * 0.5), m, 0.6 - i * 0.1);
      m = chooseNear(n, m, r, 3);
    }
    this._prevOud = m;
  }

  /**
   * Oud: Karplus-Strong, double-strung. Through a body resonance — the bowl is
   * what makes it an oud rather than a generic plucked string, and it is two
   * peaking filters.
   */
  _oudNote(out, t, midi, vel) {
    const ctx = this.ctx;
    const f = mtof(midi);
    const buf = karplusBuffer(ctx, f, 1.5, { damp: 0.40, bright: 0.66, decay: 0.9968, seed: 7 + (midi % 12), course: true });
    const s = ctx.createBufferSource();
    s.buffer = buf;
    const bowl1 = bq(ctx, 'peaking', 118, 1.4, 6);
    const bowl2 = bq(ctx, 'peaking', 260, 2.0, 4);
    const hp = bq(ctx, 'highpass', 92, 0.7);
    const g = gain(ctx, 0);
    chain(s, bowl1, bowl2, hp, g).connect(out);
    // The buffer already decays; this only shapes the head and guarantees a clean tail.
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.5 * vel, t + 0.004);
    g.gain.setTargetAtTime(0, t + 0.02, 0.55);
    s.start(t);
    s.stop(t + buf.duration);
  }

  /* ---------------- muted trumpet ---------------- */

  _lead(t0, beat, swing, chord, r, style) {
    const out = this.layers.lead;
    if (style === 'sneak') {
      // One long, distant note every few bars. Presence, not melody.
      if (this._phraseCooldown-- > 0) return;
      this._phraseCooldown = 3;
      const n = collect(chord.root, chord.chord, 68, 82);
      const m = chooseNear(n, this._prevLead, r, 7);
      this._trumpet(out, t0 + beat * 0.5, m, beat * 2.2, 0.45, false);
      this._prevLead = m;
      return;
    }

    const density = style === 'chase' ? 0.85 : style === 'alert' ? 0.7 : style === 'treasure' ? 0.6 : 0.42;
    if (!r.chance(density)) { this._phraseCooldown = 0; return; }

    const phrase = r.pick(LEAD_PHRASES);
    const lo = 66, hi = 86;
    let prev = this._prevLead;
    for (let i = 0; i < phrase.length; i++) {
      const [b, len] = phrase[i];
      const onBeat = Math.abs(b - Math.round(b)) < 1e-6;
      // Strong beats take chord tones, weak beats take the mode. Standard bebop
      // practice, and the reason this never sounds like it landed on a wrong note.
      const n = collect(chord.root, onBeat ? chord.chord : chord.scale, lo, hi);
      const m = chooseNear(n, prev, r, onBeat ? 6 : 4);
      const vel = (onBeat ? 0.62 : 0.46) * (i === 0 ? 1.0 : 0.9);
      this._trumpet(out, this._pos(t0, beat, swing, b), m, len * beat * 0.9, vel, style === 'chase' || style === 'alert');
      prev = m;
    }
    this._prevLead = prev;
  }

  /**
   * Harmon-muted trumpet: a narrow pulse through a tight bandpass at the mute's
   * formant, a breath transient in front, and a scoop up into the pitch. The
   * scoop and the breath are what make it a horn instead of a synth lead.
   */
  _trumpet(out, t, midi, dur, vel, hard) {
    const ctx = this.ctx;
    const f = mtof(midi);
    const wave = pulseWave(ctx, hard ? 0.11 : 0.15, 40);
    const o = osc(ctx, wave, f);
    // Scoop: brass players arrive at the note from underneath.
    o.frequency.setValueAtTime(f * (hard ? 0.955 : 0.975), t);
    o.frequency.exponentialRampToValueAtTime(f, t + (hard ? 0.028 : 0.05));

    const mute = bq(ctx, 'bandpass', hard ? 1500 : 1150, 2.4);
    const shape = bq(ctx, 'highpass', 320, 0.7);
    const vca = gain(ctx, 0);
    chain(o, mute, shape, vca).connect(out);
    const end = adsr(vca.gain, t, dur, { a: hard ? 0.012 : 0.022, d: 0.10, s: 0.66, r: 0.09, peak: 0.34 * vel });

    // Vibrato, but only once the note has settled — instant vibrato reads as a synth.
    const vib = osc(ctx, 'sine', 5.6);
    const vg = gain(ctx, 0);
    vg.gain.setValueAtTime(0, t);
    vg.gain.setValueAtTime(0, t + Math.min(0.16, dur * 0.4));
    vg.gain.linearRampToValueAtTime(f * 0.008, t + Math.min(0.16, dur * 0.4) + 0.12);
    vib.connect(vg).connect(o.frequency);
    vib.start(t); vib.stop(end);
    o.start(t); o.stop(end);

    // Breath: 25 ms of air through the mute before the tone speaks.
    noiseGesture(ctx, out, t, { dur: 0.05, filter: 'bandpass', freq: 2100, q: 1.1, gain: 0.055 * vel, attack: 0.004, seed: 500 });
  }
}

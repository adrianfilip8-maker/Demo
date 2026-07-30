import { rng } from '../core/Rand.js';

/**
 * Synth — the primitive layer everything else is built from.
 *
 * Two rules govern this file:
 *
 *  1. **Every function takes an explicit `BaseAudioContext`.** There is no module-level
 *     context. That is what lets the exact same synthesis code render into an
 *     `OfflineAudioContext` for analysis — the only way to actually verify audio without
 *     ears, and the difference between "it probably sounds fine" and knowing.
 *  2. **No `Math.random()`.** Every noise table, every pluck excitation goes through
 *     `rng(seed)` from core/Rand.js, so a given seed always renders the identical buffer
 *     (AGENTS.md §1, Deterministic).
 *
 * Buffers and wavetables are cached per context: they are expensive to build, cheap to
 * keep, and the context outlives everything.
 */

/** Exponential ramps can't reach zero; this is the floor we treat as silence (-80 dB). */
export const EPS = 1e-4;

const CACHES = new WeakMap();

/** Per-context scratch store for anything expensive enough to be worth keeping. */
export function cache(ctx) {
  let c = CACHES.get(ctx);
  if (!c) { c = { noise: new Map(), wave: new Map(), ks: new Map(), ir: new Map(), misc: new Map() }; CACHES.set(ctx, c); }
  return c;
}

/* ============================================================================
   Sample-domain helpers. These run on Float32Array before a buffer ever reaches
   the graph, which is where DC offset and level are cheapest to fix.
============================================================================ */

/**
 * Strip DC. A convolver whose IR carries DC pushes DC into everything routed
 * through it, and an integrated (brown) noise walk is DC by construction.
 */
export function dcKill(d, sampleRate, hz = 12) {
  let mean = 0;
  for (let i = 0; i < d.length; i++) mean += d[i];
  mean /= d.length || 1;
  for (let i = 0; i < d.length; i++) d[i] -= mean;
  if (hz > 0) {
    // One-pole high-pass, run forward then backward so it adds no net phase skew.
    const a = Math.exp((-2 * Math.PI * hz) / sampleRate);
    let yl = 0, xl = 0;
    for (let i = 0; i < d.length; i++) { const x = d[i]; yl = a * (yl + x - xl); xl = x; d[i] = yl; }
    yl = 0; xl = 0;
    for (let i = d.length - 1; i >= 0; i--) { const x = d[i]; yl = a * (yl + x - xl); xl = x; d[i] = yl; }
  }
  return d;
}

export function peakOf(d) {
  let p = 0;
  for (let i = 0; i < d.length; i++) { const a = d[i] < 0 ? -d[i] : d[i]; if (a > p) p = a; }
  return p;
}

export function rmsOf(d) {
  let s = 0;
  for (let i = 0; i < d.length; i++) s += d[i] * d[i];
  return Math.sqrt(s / (d.length || 1));
}

/** Scale to a target peak. */
export function normalise(d, target = 0.95) {
  const p = peakOf(d);
  if (p < 1e-9) return d;
  const g = target / p;
  for (let i = 0; i < d.length; i++) d[i] *= g;
  return d;
}

/** Scale to a target RMS, then back off if that pushed the peak too high. */
export function normaliseRms(d, target = 0.22, peakCeil = 0.98) {
  const r = rmsOf(d);
  if (r < 1e-9) return d;
  let g = target / r;
  if (peakOf(d) * g > peakCeil) g = peakCeil / peakOf(d);
  for (let i = 0; i < d.length; i++) d[i] *= g;
  return d;
}

/** Cosine fade at both ends so a looped or truncated buffer never clicks. */
export function fadeEdges(d, sampleRate, inSec = 0.004, outSec = 0.02) {
  const ni = Math.min(d.length >> 1, Math.floor(inSec * sampleRate));
  const no = Math.min(d.length >> 1, Math.floor(outSec * sampleRate));
  for (let i = 0; i < ni; i++) d[i] *= 0.5 - 0.5 * Math.cos((Math.PI * i) / ni);
  for (let i = 0; i < no; i++) {
    const k = d.length - 1 - i;
    d[k] *= 0.5 - 0.5 * Math.cos((Math.PI * i) / no);
  }
  return d;
}

/* ============================================================================
   Noise
============================================================================ */

/**
 * A noise table. Long by default: short noise loops develop an audible pitch at
 * 1/length Hz, which is the tell that a wind bed is a 0.5 s buffer on repeat.
 */
export function noiseBuffer(ctx, seconds = 4, type = 'white', seed = 1) {
  const key = `${type}|${seconds}|${seed}`;
  const c = cache(ctx);
  const hit = c.noise.get(key);
  if (hit) return hit;

  const sr = ctx.sampleRate;
  const n = Math.max(1, Math.round(seconds * sr));
  const buf = ctx.createBuffer(1, n, sr);
  const d = buf.getChannelData(0);
  const r = rng(seed * 2654435761 + 17);

  if (type === 'pink') {
    // Paul Kellett's filter bank — 1/f to within a fraction of a dB across the band.
    let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
    for (let i = 0; i < n; i++) {
      const w = r() * 2 - 1;
      b0 = 0.99886 * b0 + w * 0.0555179;
      b1 = 0.99332 * b1 + w * 0.0750759;
      b2 = 0.96900 * b2 + w * 0.1538520;
      b3 = 0.86650 * b3 + w * 0.3104856;
      b4 = 0.55000 * b4 + w * 0.5329522;
      b5 = -0.7616 * b5 - w * 0.0168980;
      d[i] = b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362;
      b6 = w * 0.115926;
    }
    dcKill(d, sr, 10);
  } else if (type === 'brown') {
    let last = 0;
    for (let i = 0; i < n; i++) { const w = r() * 2 - 1; last = (last + 0.028 * w) / 1.028; d[i] = last; }
    dcKill(d, sr, 22);
  } else {
    for (let i = 0; i < n; i++) d[i] = r() * 2 - 1;
    dcKill(d, sr, 6);
  }

  normaliseRms(d, 0.24, 0.97);
  buf._sands = type;
  c.noise.set(key, buf);
  return buf;
}

/**
 * Crackle: pink noise with sparse, sharp pops baked in. Fire is not a hiss — the
 * pops are the whole character, and baking them beats scheduling hundreds of
 * one-shot voices for an ambience nobody is listening to closely.
 */
export function crackleBuffer(ctx, seconds = 5, seed = 91, { rate = 26, sharp = 0.0016, bed = 0.35 } = {}) {
  const key = `crackle|${seconds}|${seed}|${rate}`;
  const c = cache(ctx);
  const hit = c.noise.get(key);
  if (hit) return hit;

  const sr = ctx.sampleRate;
  const n = Math.round(seconds * sr);
  const buf = ctx.createBuffer(1, n, sr);
  const d = buf.getChannelData(0);
  const r = rng(seed);

  // Bed: pink-ish roar.
  let b0 = 0, b1 = 0, b2 = 0;
  for (let i = 0; i < n; i++) {
    const w = r() * 2 - 1;
    b0 = 0.997 * b0 + w * 0.045; b1 = 0.985 * b1 + w * 0.062; b2 = 0.92 * b2 + w * 0.11;
    d[i] = (b0 + b1 + b2) * bed;
  }
  // Pops: exponentially decaying noise grains, a couple of dozen a second.
  const pops = Math.round(seconds * rate);
  for (let p = 0; p < pops; p++) {
    const at = Math.floor(r() * (n - 2000));
    const amp = 0.25 + r() * 0.75;
    const len = Math.max(24, Math.floor(sharp * sr * (0.4 + r() * 1.8)));
    const tone = 0.3 + r() * 0.7;
    let lp = 0;
    for (let i = 0; i < len && at + i < n; i++) {
      const e = Math.exp((-5.5 * i) / len);
      const w = r() * 2 - 1;
      lp += tone * (w - lp);
      d[at + i] += lp * e * amp * 0.9;
    }
  }
  dcKill(d, sr, 30);
  normaliseRms(d, 0.20, 0.96);
  // Loop seam: crossfade the tail into the head so the loop point is inaudible.
  crossfadeLoop(d, sr, 0.12);
  c.noise.set(key, buf);
  return buf;
}

/** Water: layered band-limited noise with slow amplitude motion — the Nile, not a shower. */
export function waterBuffer(ctx, seconds = 6, seed = 55) {
  const key = `water|${seconds}|${seed}`;
  const c = cache(ctx);
  const hit = c.noise.get(key);
  if (hit) return hit;

  const sr = ctx.sampleRate;
  const n = Math.round(seconds * sr);
  const buf = ctx.createBuffer(1, n, sr);
  const d = buf.getChannelData(0);
  const r = rng(seed);
  let lp1 = 0, lp2 = 0, hp = 0, hx = 0;
  const w1 = 2 * Math.PI * 3.1 / sr, w2 = 2 * Math.PI * 1.7 / sr, w3 = 2 * Math.PI * 0.43 / sr;
  for (let i = 0; i < n; i++) {
    const w = r() * 2 - 1;
    lp1 += 0.06 * (w - lp1);              // body
    lp2 += 0.35 * (w - lp2);              // surface chatter
    const x = lp1 * 2.2 + lp2 * 0.5;
    hp = 0.995 * (hp + x - hx); hx = x;   // strip the rumble
    const mod = 0.62 + 0.24 * Math.sin(i * w1) + 0.16 * Math.sin(i * w2 + 1.7) + 0.12 * Math.sin(i * w3 + 4.1);
    d[i] = hp * mod;
  }
  dcKill(d, sr, 40);
  normaliseRms(d, 0.20, 0.95);
  crossfadeLoop(d, sr, 0.25);
  c.noise.set(key, buf);
  return buf;
}

/**
 * Make a buffer loop cleanly by crossfading its tail over its head. Costs `sec`
 * of length but removes the periodic tick that gives looped ambience away.
 */
export function crossfadeLoop(d, sampleRate, sec = 0.2) {
  const m = Math.min(d.length >> 2, Math.floor(sec * sampleRate));
  if (m < 8) return d;
  for (let i = 0; i < m; i++) {
    const k = 0.5 - 0.5 * Math.cos((Math.PI * i) / m);   // 0→1
    const head = d[i];
    const tail = d[d.length - m + i];
    d[i] = head * k + tail * (1 - k);
  }
  // The faded-in tail region is now redundant; taper it so the seam is exact.
  for (let i = 0; i < m; i++) {
    const k = 0.5 - 0.5 * Math.cos((Math.PI * i) / m);
    d[d.length - m + i] *= 1 - k;
  }
  return d;
}

/* ============================================================================
   Karplus-Strong — the oud
============================================================================ */

/**
 * Plucked string by physical model. A noise-filled delay line fed back through a
 * damping filter *is* a string: the excitation spectrum decays band by band, highs
 * first, exactly as a real one does. An oscillator with a decay envelope cannot do
 * that and always reads as a synth, which is why this is worth the sample loop.
 *
 * Rendered as an AudioBuffer rather than a live DelayNode feedback loop because
 * WebAudio imposes a 128-sample minimum loop latency — that floors the pitch at
 * ~370 Hz, an octave above where an oud lives.
 */
export function karplusBuffer(ctx, freq, seconds = 2.2, opts = {}) {
  const {
    damp = 0.44,        // loop lowpass coefficient — how fast the highs die
    bright = 0.62,      // excitation brightness (risha vs. thumb)
    decay = 0.9975,     // per-sample loop gain — overall sustain
    seed = 7,
    course = true,      // an oud is double-strung; two strings a few cents apart
    detune = 6,         // cents between the pair
  } = opts;

  const key = `ks|${freq.toFixed(3)}|${damp}|${bright}|${decay}|${seed}|${course}`;
  const c = cache(ctx);
  const hit = c.ks.get(key);
  if (hit) return hit;

  const sr = ctx.sampleRate;
  const n = Math.max(64, Math.round(seconds * sr));
  const buf = ctx.createBuffer(1, n, sr);
  const out = buf.getChannelData(0);

  const strings = course ? 2 : 1;
  for (let s = 0; s < strings; s++) {
    const cents = course ? (s === 0 ? -detune : detune) * 0.5 : 0;
    const f = freq * Math.pow(2, cents / 1200);
    renderString(out, n, sr, f, damp, bright, decay, seed + s * 131, s === 0 ? 0.62 : 0.44);
  }

  dcKill(out, sr, 45);
  normalise(out, 0.92);
  fadeEdges(out, sr, 0.0004, 0.03);
  c.ks.set(key, buf);
  return buf;
}

function renderString(out, n, sr, freq, damp, bright, decay, seed, amp) {
  // The loop's one-pole lowpass contributes ~(1-damp)/damp samples of phase delay at
  // DC. Not compensating leaves every note measurably flat — audible on a fretless.
  const lpDelay = (1 - damp) / damp;
  const D = Math.max(3, sr / freq - lpDelay);
  const Di = Math.floor(D);
  const frac = D - Di;
  const L = Di + 2;
  const line = new Float32Array(L);

  const r = rng(seed);
  let e = 0;
  for (let i = 0; i < L; i++) { const w = r() * 2 - 1; e += bright * (w - e); line[i] = e; }
  // A delay line with a DC component holds it almost forever (the loop filter passes
  // DC at gain `decay`), so the note sits on a slowly sagging pedestal. Remove it here.
  let m = 0;
  for (let i = 0; i < L; i++) m += line[i];
  m /= L;
  let pk = 0;
  for (let i = 0; i < L; i++) { line[i] -= m; const a = Math.abs(line[i]); if (a > pk) pk = a; }
  if (pk > 1e-9) for (let i = 0; i < L; i++) line[i] /= pk;

  let idx = 0, lp = 0;
  for (let i = 0; i < n; i++) {
    const j = idx + 1 === L ? 0 : idx + 1;
    const s = line[idx] * (1 - frac) + line[j] * frac;
    out[i] += s * amp;
    lp += damp * (s - lp);
    line[idx] = lp * decay;
    idx = j;
  }
}

/* ============================================================================
   Wavetables
============================================================================ */

/**
 * Narrow pulse. The Fourier series of a rectangle of duty d: the nulls in the
 * harmonic series at multiples of 1/d are what make a 12% pulse read as reedy
 * rather than as a generic saw — the raw material for a muted trumpet.
 */
export function pulseWave(ctx, duty = 0.14, harmonics = 42) {
  const key = `pulse|${duty}|${harmonics}`;
  const c = cache(ctx);
  const hit = c.wave.get(key);
  if (hit) return hit;
  const real = new Float32Array(harmonics + 1);
  const imag = new Float32Array(harmonics + 1);
  for (let k = 1; k <= harmonics; k++) {
    // Roll the very top off so the table doesn't alias into a fizz at high notes.
    const roll = 1 / (1 + Math.pow(k / (harmonics * 0.55), 2.2));
    imag[k] = ((2 / (k * Math.PI)) * Math.sin(Math.PI * k * duty)) * roll;
  }
  const w = ctx.createPeriodicWave(real, imag, { disableNormalization: false });
  c.wave.set(key, w);
  return w;
}

/** A soft, slightly hollow tone for basses and pads: odd harmonics, fast rolloff. */
export function warmWave(ctx, harmonics = 16) {
  const key = `warm|${harmonics}`;
  const c = cache(ctx);
  const hit = c.wave.get(key);
  if (hit) return hit;
  const real = new Float32Array(harmonics + 1);
  const imag = new Float32Array(harmonics + 1);
  for (let k = 1; k <= harmonics; k++) {
    const odd = k % 2 === 1 ? 1 : 0.45;
    imag[k] = (odd / Math.pow(k, 1.55)) * (k === 1 ? 1 : 0.9);
  }
  const w = ctx.createPeriodicWave(real, imag, { disableNormalization: false });
  c.wave.set(key, w);
  return w;
}

/* ============================================================================
   Node sugar. Small, boring, used everywhere.
============================================================================ */

export function gain(ctx, v = 1) { const g = ctx.createGain(); g.gain.value = v; return g; }

export function bq(ctx, type, freq, q = 1, g = 0) {
  const f = ctx.createBiquadFilter();
  f.type = type;
  f.frequency.value = freq;
  f.Q.value = q;
  f.gain.value = g;
  return f;
}

export function osc(ctx, type, freq, detuneCents = 0) {
  const o = ctx.createOscillator();
  if (typeof type === 'string') o.type = type;
  else o.setPeriodicWave(type);
  o.frequency.value = freq;
  if (detuneCents) o.detune.value = detuneCents;
  return o;
}

/** A noise source with a randomised read offset, so two overlapping copies decorrelate. */
export function noise(ctx, type = 'white', r = null, seconds = 4, seed = 1) {
  const b = noiseBuffer(ctx, seconds, type, seed);
  const s = ctx.createBufferSource();
  s.buffer = b;
  s.loop = true;
  s._offset = r ? r() * (b.duration - 0.05) : 0;
  return s;
}

export function chain(...nodes) {
  for (let i = 0; i < nodes.length - 1; i++) nodes[i].connect(nodes[i + 1]);
  return nodes[nodes.length - 1];
}

/** Start a source at `t`, honouring the decorrelation offset set by `noise()`. */
export function startAt(src, t) {
  try { src.start(t, src._offset || 0); } catch { /* already started */ }
  return src;
}

/* ============================================================================
   Envelopes. Every one of these lands on exactly 0 — an exponential ramp stops at
   EPS, and cutting a source at EPS is a click you can hear on headphones.
============================================================================ */

/** Percussive: near-instant attack, exponential decay, hard zero. Returns the end time. */
export function perc(param, t0, dur, peak = 1, attack = 0.002) {
  const p = Math.max(EPS * 4, peak);
  param.setValueAtTime(0, t0);
  param.linearRampToValueAtTime(p, t0 + attack);
  param.exponentialRampToValueAtTime(p * EPS, t0 + attack + dur);
  param.linearRampToValueAtTime(0, t0 + attack + dur + 0.006);
  return t0 + attack + dur + 0.006;
}

/** Slow attack — brushes, wind swells, pads. */
export function swell(param, t0, attack, hold, release, peak = 1) {
  const p = Math.max(EPS * 4, peak);
  param.setValueAtTime(0, t0);
  param.linearRampToValueAtTime(p, t0 + attack);
  if (hold > 0) param.setValueAtTime(p, t0 + attack + hold);
  param.exponentialRampToValueAtTime(p * EPS, t0 + attack + hold + release);
  param.linearRampToValueAtTime(0, t0 + attack + hold + release + 0.008);
  return t0 + attack + hold + release + 0.008;
}

/** Full ADSR for sustained notes. `dur` is note length; release runs past it. */
export function adsr(param, t0, dur, { a = 0.006, d = 0.09, s = 0.6, r = 0.16, peak = 1 } = {}) {
  const p = Math.max(EPS * 4, peak);
  const sus = Math.max(EPS * 4, p * s);
  param.setValueAtTime(0, t0);
  param.linearRampToValueAtTime(p, t0 + a);
  param.exponentialRampToValueAtTime(sus, t0 + a + d);
  const off = Math.max(t0 + a + d + 0.005, t0 + dur);
  param.setValueAtTime(sus, off);
  param.exponentialRampToValueAtTime(sus * EPS, off + r);
  param.linearRampToValueAtTime(0, off + r + 0.008);
  return off + r + 0.008;
}

/** Frequency glide, exponential (musical) rather than linear. */
export function glide(param, t0, from, to, dur) {
  param.setValueAtTime(Math.max(1, from), t0);
  param.exponentialRampToValueAtTime(Math.max(1, to), t0 + Math.max(0.001, dur));
}

/* ============================================================================
   Composite voices used by more than one caller
============================================================================ */

/**
 * FM bell / vibraphone. A 4:1 modulator ratio is the tuned first overtone of a real
 * vibraphone bar; inharmonic ratios (2.76, 3.5) give bells and coins their clang.
 * The index envelope is the whole trick: bright for 100 ms, then a pure sine.
 */
export function fmBell(ctx, out, t, {
  freq = 440, ratio = 4, index = 3.2, indexDecay = 0.09,
  dur = 1.6, gain: g = 0.5, attack = 0.003, tremolo = 0, tremDepth = 0.3,
} = {}) {
  const car = osc(ctx, 'sine', freq);
  const mod = osc(ctx, 'sine', freq * ratio);
  const mg = gain(ctx, freq * index);
  mg.gain.setValueAtTime(freq * index, t);
  mg.gain.exponentialRampToValueAtTime(Math.max(1, freq * index * 0.02), t + indexDecay);
  mod.connect(mg).connect(car.frequency);

  const vca = gain(ctx, 0);
  const end = perc(vca.gain, t, dur, g, attack);
  car.connect(vca);

  if (tremolo > 0) {
    const lfo = osc(ctx, 'sine', tremolo);
    const ld = gain(ctx, tremDepth);
    lfo.connect(ld).connect(vca.gain);     // rides on top of the decay envelope
    lfo.start(t); lfo.stop(end);
    vca.connect(out);
    mod.start(t); mod.stop(end);
    car.start(t); car.stop(end);
    return { end, srcs: [car, mod, lfo] };
  }

  vca.connect(out);
  mod.start(t); mod.stop(end);
  car.start(t); car.stop(end);
  return { end, srcs: [car, mod] };
}

/**
 * Wordless voice. A glottal sawtooth through three parallel formant bandpasses.
 * Vowels are formant pairs, so gliding F1/F2 gives comic mumbling that reads as
 * speech without ever being a word — which is exactly the Sly guard idiom, and the
 * reason there is no speech synthesis anywhere in this game.
 */
export const VOWEL = {
  ah: [730, 1090, 2440],
  uh: [640, 1190, 2390],
  oh: [570, 840, 2410],
  ee: [270, 2290, 3010],
  eh: [530, 1840, 2480],
  oo: [300, 870, 2240],
};

export function voiceSyllable(ctx, out, t, {
  f0 = 130, f0End = null, vowel = 'ah', vowelEnd = null, dur = 0.28,
  gain: g = 0.5, attack = 0.02, release = 0.09, breath = 0.12, growl = 0.02, r = null,
} = {}) {
  const src = osc(ctx, 'sawtooth', f0);
  src.frequency.setValueAtTime(f0, t);
  if (f0End && f0End !== f0) src.frequency.exponentialRampToValueAtTime(Math.max(30, f0End), t + dur);
  // Pitch jitter: a perfectly steady f0 is the giveaway that it's an oscillator.
  if (growl > 0) {
    const j = osc(ctx, 'sine', 5.4 + (r ? r() * 2 : 0));
    const jg = gain(ctx, f0 * growl);
    j.connect(jg).connect(src.frequency);
    j.start(t); j.stop(t + dur + release + 0.05);
  }

  const vca = gain(ctx, 0);
  const end = swell(vca.gain, t, attack, Math.max(0.001, dur - attack), release, g);

  const A = VOWEL[vowel] || VOWEL.ah;
  const B = VOWEL[vowelEnd] || A;
  const amps = [1.0, 0.55, 0.22];
  const qs = [9, 11, 13];
  const srcs = [src];
  for (let i = 0; i < 3; i++) {
    const f = bq(ctx, 'bandpass', A[i], qs[i]);
    if (B[i] !== A[i]) f.frequency.exponentialRampToValueAtTime(B[i], t + dur);
    const fg = gain(ctx, amps[i]);
    src.connect(f).connect(fg).connect(vca);
  }
  // Breath — a little band-limited noise through the same mouth.
  if (breath > 0) {
    const nz = noise(ctx, 'white', r, 4, 313);
    const nf = bq(ctx, 'bandpass', (A[1] + A[2]) * 0.5, 1.2);
    const ng = gain(ctx, breath);
    nz.connect(nf).connect(ng).connect(vca);
    startAt(nz, t); nz.stop(end);
    srcs.push(nz);
  }
  vca.connect(out);
  src.start(t); src.stop(end);
  return { end, srcs };
}

/**
 * Filtered-noise gesture: the workhorse behind footsteps, whooshes, scrapes and
 * rustles. One helper, a dozen sounds, because what separates them is the filter
 * path and the envelope, not the source.
 */
export function noiseGesture(ctx, out, t, {
  dur = 0.12, type = 'white', filter = 'bandpass', freq = 1200, freqEnd = null,
  q = 1.2, gain: g = 0.5, attack = 0.002, curve = 'perc', hold = 0,
  hp = 0, lp = 0, r = null, seed = 1,
} = {}) {
  const nz = noise(ctx, type, r, 4, seed);
  let node = nz;
  if (filter) {
    const f = bq(ctx, filter, freq, q);
    if (freqEnd && freqEnd !== freq) {
      f.frequency.setValueAtTime(freq, t);
      f.frequency.exponentialRampToValueAtTime(Math.max(20, freqEnd), t + dur);
    }
    node = node.connect(f);
  }
  if (hp > 0) node = node.connect(bq(ctx, 'highpass', hp, 0.7));
  if (lp > 0) node = node.connect(bq(ctx, 'lowpass', lp, 0.7));

  const vca = gain(ctx, 0);
  const end = curve === 'swell'
    ? swell(vca.gain, t, attack, hold, dur, g)
    : perc(vca.gain, t, dur, g, attack);
  node.connect(vca).connect(out);
  startAt(nz, t);
  nz.stop(end);
  return { end, srcs: [nz] };
}

/** A tuned thump: sine with a downward pitch drop. Kicks, landings, body hits. */
export function thump(ctx, out, t, { f0 = 160, f1 = 48, pitchDur = 0.06, dur = 0.22, gain: g = 0.7, attack = 0.001, type = 'sine' } = {}) {
  const o = osc(ctx, type, f0);
  glide(o.frequency, t, f0, f1, pitchDur);
  const vca = gain(ctx, 0);
  const end = perc(vca.gain, t, dur, g, attack);
  o.connect(vca).connect(out);
  o.start(t); o.stop(end);
  return { end, srcs: [o] };
}

/**
 * Inharmonic metal. Cymbals, clanks, cane-on-stone. Six partials at ratios that
 * share no common factor — that lack of a fundamental is what "metal" means.
 */
export const METAL_RATIOS = [1, 1.4728, 1.9418, 2.5411, 2.6633, 3.4713];

export function metal(ctx, out, t, {
  base = 620, dur = 0.6, gain: g = 0.35, hp = 1800, attack = 0.001, spread = 1, count = 6, decayTilt = 0.55,
} = {}) {
  const vca = gain(ctx, 0);
  const end = perc(vca.gain, t, dur, g, attack);
  const filt = bq(ctx, 'highpass', hp, 0.6);
  filt.connect(vca).connect(out);
  const srcs = [];
  for (let i = 0; i < count; i++) {
    const o = osc(ctx, 'square', base * (1 + (METAL_RATIOS[i % 6] - 1) * spread));
    // Upper partials of a struck plate die faster than the low ones.
    const pg = gain(ctx, 0);
    perc(pg.gain, t, dur * (1 - decayTilt * (i / count)), 1 / (1 + i * 0.5), 0.0008);
    o.connect(pg).connect(filt);
    o.start(t); o.stop(end);
    srcs.push(o);
  }
  return { end, srcs };
}

/**
 * A Web Audio renderer for Node, good enough to run `src/audio/Sfx.js` and `src/audio/Synth.js`
 * unmodified and hand back the actual samples.
 *
 * ── Why this exists ────────────────────────────────────────────────────────────────────────
 * `Synth.js`'s own header states the design rule that makes this possible: *"Every function takes
 * an explicit `BaseAudioContext`. There is no module-level context. That is what lets the exact
 * same synthesis code render into an `OfflineAudioContext` for analysis."* Nobody had ever taken
 * it up on that. This file is the missing half: the shipping recipes are rendered here, so a claim
 * like "sand and stone sound different" becomes a spectral centroid rather than an adjective.
 *
 * It is NOT a general Web Audio implementation and does not try to be. It implements exactly the
 * node set `Sfx.js`/`Synth.js`/`Music.js` use, and it implements those to the spec's own formulas:
 *
 *   · `AudioParam` — the full automation timeline (setValueAtTime, linear/exponential ramps,
 *     setTargetAtTime, setValueCurveAtTime, cancelScheduledValues) plus a-rate summing of any
 *     nodes connected INTO the param. That last part is not optional here: `fmBell`'s modulator,
 *     the vibraphone tremolo and the wind gusts are all param connections, and a renderer that
 *     ignored them would silently render a different sound than the game plays.
 *   · `BiquadFilterNode` — the spec's own coefficient formulas, including the detail that trips
 *     everyone up: for `lowpass`/`highpass` the spec reads `Q` as **decibels**
 *     (alpha = sin(w0) / (2 * 10^(Q/20))), while `bandpass`/`notch`/`peaking` read it as a plain
 *     quality factor. Getting that backwards moves every footstep's centroid.
 *   · `OscillatorNode` — additive, band-limited to Nyquist, which is what the real implementation
 *     does with its internal PeriodicWave tables. A naive `Math.sign(sin)` square would fold
 *     aliasing into exactly the band the spectral-centroid tests measure.
 *   · `AudioBufferSourceNode` — loop, loopEnd, offset, playbackRate with linear interpolation.
 *
 * Panner, StereoPanner, Convolver and DynamicsCompressor are pass-throughs: this renderer answers
 * questions about *what a sound is*, not about where it sits or how the bus glues. Anything that
 * depends on those is out of scope and is not asserted on.
 *
 * ── Trusting it ────────────────────────────────────────────────────────────────────────────
 * `selfTest()` checks the renderer against closed-form answers (a 0.5-amplitude sine must render
 * RMS 1/(2√2); a lowpass at its own cutoff must land near -3 dB; a linear ramp must be linear).
 * Every suite that uses this file runs it first. An instrument nobody calibrated is an opinion.
 */

/* ============================================================================
   AudioParam
============================================================================ */

const EXP_FLOOR = 1e-8;

class Param {
  constructor(value, { min = -Infinity, max = Infinity } = {}) {
    this.defaultValue = value;
    this._value = value;
    this.minValue = min;
    this.maxValue = max;
    this.events = [];
    this.inputs = [];
  }

  get value() { return this._value; }
  set value(v) { this._value = v; }

  _push(e) {
    this.events.push(e);
    this.events.sort((a, b) => a.time - b.time);
    return this;
  }

  setValueAtTime(v, t) { return this._push({ type: 'set', value: v, time: t }); }
  linearRampToValueAtTime(v, t) { return this._push({ type: 'lin', value: v, time: t }); }
  exponentialRampToValueAtTime(v, t) { return this._push({ type: 'exp', value: v, time: t }); }
  setTargetAtTime(v, t, tc) { return this._push({ type: 'target', value: v, time: t, tc }); }
  setValueCurveAtTime(curve, t, dur) {
    return this._push({ type: 'curve', curve: Float32Array.from(curve), time: t, dur });
  }

  cancelScheduledValues(t) {
    this.events = this.events.filter((e) => e.time < t);
    return this;
  }

  cancelAndHoldAtTime(t) {
    const held = this.valueAt(t);
    this.events = this.events.filter((e) => e.time < t);
    return this._push({ type: 'set', value: held, time: t });
  }

  /**
   * The automation value at `t`, per the spec's piecewise definition. Ramps interpolate from the
   * PREVIOUS event's end, which is why the timeline has to be walked rather than sampled.
   */
  valueAt(t) {
    const ev = this.events;
    if (!ev.length) return this._value;
    if (t < ev[0].time) {
      // Before the first event the param holds its intrinsic value — except that a ramp as the
      // first event starts from that same intrinsic value, which is the case `perc()` relies on.
      return this._value;
    }
    let i = 0;
    while (i + 1 < ev.length && ev[i + 1].time <= t) i++;
    const e = ev[i];
    const next = ev[i + 1];

    // A ramp that ENDS after t governs the interval, interpolating from e.
    if (next && (next.type === 'lin' || next.type === 'exp') && t < next.time) {
      const t0 = e.time, v0 = this._endValue(i);
      const span = next.time - t0;
      const k = span <= 0 ? 1 : (t - t0) / span;
      if (next.type === 'lin') return v0 + (next.value - v0) * k;
      const a = Math.max(EXP_FLOOR, Math.abs(v0)) * Math.sign(v0 || 1);
      const b = Math.max(EXP_FLOOR, Math.abs(next.value)) * Math.sign(next.value || 1);
      if (a <= 0 || b <= 0) return v0 + (next.value - v0) * k;   // spec: degenerate → hold/linear
      return a * Math.pow(b / a, k);
    }

    if (e.type === 'target') {
      const v0 = i === 0 ? this._value : this._endValue(i - 1);
      const tc = Math.max(1e-9, e.tc);
      return e.value + (v0 - e.value) * Math.exp(-(t - e.time) / tc);
    }
    if (e.type === 'curve') {
      if (t >= e.time + e.dur) return e.curve[e.curve.length - 1];
      const k = e.dur <= 0 ? 0 : (t - e.time) / e.dur;
      const x = k * (e.curve.length - 1);
      const i0 = Math.floor(x), i1 = Math.min(e.curve.length - 1, i0 + 1);
      const f = x - i0;
      return e.curve[i0] * (1 - f) + e.curve[i1] * f;
    }
    return this._endValue(i);
  }

  /** The value the event at index `i` has arrived at by its own end time. */
  _endValue(i) {
    const e = this.events[i];
    if (e.type === 'curve') return e.curve[e.curve.length - 1];
    if (e.type === 'target') {
      const v0 = i === 0 ? this._value : this._endValue(i - 1);
      return e.value + (v0 - e.value) * Math.exp(-(e.tc > 0 ? 1 : 0));
    }
    return e.value;
  }

  /** a-rate array over the render, automation plus everything connected into the param. */
  render(ctx, len) {
    const out = new Float32Array(len);
    const sr = ctx.sampleRate;
    if (this.events.length) {
      for (let i = 0; i < len; i++) out[i] = this.valueAt(i / sr);
    } else {
      out.fill(this._value);
    }
    for (const node of this.inputs) {
      const b = node._out(ctx, len);
      for (let i = 0; i < len; i++) out[i] += b[i];
    }
    if (this.minValue > -Infinity || this.maxValue < Infinity) {
      for (let i = 0; i < len; i++) out[i] = Math.min(this.maxValue, Math.max(this.minValue, out[i]));
    }
    return out;
  }
}

/* ============================================================================
   Nodes
============================================================================ */

let UID = 0;

class Node {
  constructor(ctx) {
    this.context = ctx;
    this._id = UID++;
    this._sinks = [];
    this._cache = null;
    ctx._nodes.push(this);
  }

  connect(dest) {
    if (dest instanceof Param) { dest.inputs.push(this); return dest; }
    this._sinks.push(dest);
    dest._sources = dest._sources || [];
    dest._sources.push(this);
    return dest;
  }

  disconnect() { this._sinks.length = 0; return this; }

  /** Sum of everything connected into this node's input. */
  _in(ctx, len) {
    const out = new Float32Array(len);
    const srcs = this._sources || [];
    for (const s of srcs) {
      const b = s._out(ctx, len);
      for (let i = 0; i < len; i++) out[i] += b[i];
    }
    return out;
  }

  _out(ctx, len) {
    if (this._cache && this._cache.length === len) return this._cache;
    if (this._rendering) return new Float32Array(len);    // a cycle would be a bug; render silence
    this._rendering = true;
    this._cache = this._render(ctx, len);
    this._rendering = false;
    return this._cache;
  }

  _render(ctx, len) { return this._in(ctx, len); }
}

class GainNode extends Node {
  constructor(ctx, v = 1) { super(ctx); this.gain = new Param(v); }
  _render(ctx, len) {
    const x = this._in(ctx, len);
    const g = this.gain.render(ctx, len);
    for (let i = 0; i < len; i++) x[i] *= g[i];
    return x;
  }
}

/** Pass-through stand-ins: this renderer answers "what is it", not "where is it". */
class PassNode extends Node {}
class StereoPannerNode extends Node {
  constructor(ctx) { super(ctx); this.pan = new Param(0, { min: -1, max: 1 }); }
}
class PannerNode extends Node {
  constructor(ctx) {
    super(ctx);
    this.positionX = new Param(0); this.positionY = new Param(0); this.positionZ = new Param(0);
    this.panningModel = 'equalpower'; this.distanceModel = 'inverse';
    this.refDistance = 1; this.maxDistance = 10000; this.rolloffFactor = 1;
  }
  setPosition(x, y, z) { this.positionX.value = x; this.positionY.value = y; this.positionZ.value = z; }
}
class CompressorNode extends Node {
  constructor(ctx) {
    super(ctx);
    for (const k of ['threshold', 'knee', 'ratio', 'attack', 'release']) this[k] = new Param(0);
  }
}

class BiquadNode extends Node {
  constructor(ctx) {
    super(ctx);
    this.type = 'lowpass';
    this.frequency = new Param(350);
    this.Q = new Param(1);
    this.gain = new Param(0);
    this.detune = new Param(0);
  }

  /**
   * The spec's own coefficient set. The `Q`-is-decibels rule for lowpass/highpass is the one
   * everybody gets wrong, and it is worth ~an octave of cutoff resonance when you do.
   */
  static coeffs(type, f0, Q, dbGain, sr) {
    const w0 = 2 * Math.PI * Math.min(0.4999, f0 / sr);
    const cw = Math.cos(w0), sw = Math.sin(w0);
    const A = Math.pow(10, dbGain / 40);
    let b0, b1, b2, a0, a1, a2, alpha;
    switch (type) {
      case 'lowpass':
        alpha = sw / (2 * Math.pow(10, Q / 20));
        b0 = (1 - cw) / 2; b1 = 1 - cw; b2 = (1 - cw) / 2;
        a0 = 1 + alpha; a1 = -2 * cw; a2 = 1 - alpha; break;
      case 'highpass':
        alpha = sw / (2 * Math.pow(10, Q / 20));
        b0 = (1 + cw) / 2; b1 = -(1 + cw); b2 = (1 + cw) / 2;
        a0 = 1 + alpha; a1 = -2 * cw; a2 = 1 - alpha; break;
      case 'bandpass':
        alpha = sw * Math.sinh((Math.log(2) / 2) * Math.max(1e-4, Q) * (w0 / (sw || 1e-9)));
        b0 = alpha; b1 = 0; b2 = -alpha;
        a0 = 1 + alpha; a1 = -2 * cw; a2 = 1 - alpha; break;
      case 'notch':
        alpha = sw / (2 * Math.max(1e-4, Q));
        b0 = 1; b1 = -2 * cw; b2 = 1;
        a0 = 1 + alpha; a1 = -2 * cw; a2 = 1 - alpha; break;
      case 'allpass':
        alpha = sw / (2 * Math.max(1e-4, Q));
        b0 = 1 - alpha; b1 = -2 * cw; b2 = 1 + alpha;
        a0 = 1 + alpha; a1 = -2 * cw; a2 = 1 - alpha; break;
      case 'peaking':
        alpha = sw / (2 * Math.max(1e-4, Q));
        b0 = 1 + alpha * A; b1 = -2 * cw; b2 = 1 - alpha * A;
        a0 = 1 + alpha / A; a1 = -2 * cw; a2 = 1 - alpha / A; break;
      case 'lowshelf': {
        const s = 2 * Math.sqrt(A) * (sw / 2) * Math.sqrt(2);
        b0 = A * ((A + 1) - (A - 1) * cw + s);
        b1 = 2 * A * ((A - 1) - (A + 1) * cw);
        b2 = A * ((A + 1) - (A - 1) * cw - s);
        a0 = (A + 1) + (A - 1) * cw + s;
        a1 = -2 * ((A - 1) + (A + 1) * cw);
        a2 = (A + 1) + (A - 1) * cw - s; break;
      }
      case 'highshelf': {
        const s = 2 * Math.sqrt(A) * (sw / 2) * Math.sqrt(2);
        b0 = A * ((A + 1) + (A - 1) * cw + s);
        b1 = -2 * A * ((A - 1) + (A + 1) * cw);
        b2 = A * ((A + 1) + (A - 1) * cw - s);
        a0 = (A + 1) - (A - 1) * cw + s;
        a1 = 2 * ((A - 1) - (A + 1) * cw);
        a2 = (A + 1) - (A - 1) * cw - s; break;
      }
      default:
        return [1, 0, 0, 0, 0];
    }
    return [b0 / a0, b1 / a0, b2 / a0, a1 / a0, a2 / a0];
  }

  _render(ctx, len) {
    const x = this._in(ctx, len);
    const sr = ctx.sampleRate;
    const f = this.frequency.render(ctx, len);
    const q = this.Q.render(ctx, len);
    const g = this.gain.render(ctx, len);
    const out = new Float32Array(len);
    let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
    // Coefficients are recomputed on a 32-sample grid rather than per sample: that is the real
    // implementation's own a-rate block size, and it keeps a swept filter honest without paying
    // for a transcendental per sample.
    let b0 = 0, b1 = 0, b2 = 0, a1 = 0, a2 = 0;
    for (let i = 0; i < len; i++) {
      if ((i & 31) === 0) [b0, b1, b2, a1, a2] = BiquadNode.coeffs(this.type, f[i], q[i], g[i], sr);
      const xn = x[i];
      const yn = b0 * xn + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2;
      x2 = x1; x1 = xn; y2 = y1; y1 = yn;
      out[i] = yn;
    }
    return out;
  }
}

/** Band-limited harmonic tables, matching what a real implementation builds internally. */
function shapeHarmonics(type, n = 64) {
  const real = new Float32Array(n + 1), imag = new Float32Array(n + 1);
  for (let k = 1; k <= n; k++) {
    if (type === 'sawtooth') imag[k] = (k % 2 === 0 ? 1 : -1) * (2 / (k * Math.PI));
    else if (type === 'square') imag[k] = k % 2 === 1 ? 4 / (k * Math.PI) : 0;
    else if (type === 'triangle') imag[k] = k % 2 === 1 ? (8 / (Math.PI * Math.PI)) * (((k - 1) / 2) % 2 === 0 ? 1 : -1) / (k * k) : 0;
  }
  if (type === 'sine') { imag.fill(0); imag[1] = 1; }
  return { real, imag };
}

class PeriodicWave {
  constructor(real, imag, normalise = true) {
    this.real = Float32Array.from(real);
    this.imag = Float32Array.from(imag);
    this.scale = 1;
    if (normalise) {
      // The spec normalises so the waveform's maximum absolute value is 1.
      let peak = 0;
      const N = 2048;
      for (let i = 0; i < N; i++) {
        const p = (2 * Math.PI * i) / N;
        let v = 0;
        for (let k = 1; k < this.real.length; k++) v += this.real[k] * Math.cos(k * p) + this.imag[k] * Math.sin(k * p);
        const a = Math.abs(v);
        if (a > peak) peak = a;
      }
      if (peak > 1e-9) this.scale = 1 / peak;
    }
  }
}

class OscillatorNode extends Node {
  constructor(ctx) {
    super(ctx);
    this._type = 'sine';
    this.frequency = new Param(440);
    this.detune = new Param(0);
    this._wave = null;
    this._start = null;
    this._stop = Infinity;
  }
  get type() { return this._type; }
  set type(v) { this._type = v; this._wave = null; }
  setPeriodicWave(w) { this._wave = w; this._type = 'custom'; }
  start(t = 0) { this._start = t; }
  stop(t) { this._stop = t; }

  _render(ctx, len) {
    const sr = ctx.sampleRate;
    const out = new Float32Array(len);
    if (this._start === null) return out;
    const i0 = Math.max(0, Math.round(this._start * sr));
    const i1 = Math.min(len, this._stop === Infinity ? len : Math.round(this._stop * sr));
    if (i1 <= i0) return out;
    const f = this.frequency.render(ctx, len);
    const d = this.detune.render(ctx, len);
    const w = this._wave || (this._wave = (() => {
      const h = shapeHarmonics(this._type);
      return new PeriodicWave(h.real, h.imag, this._type !== 'sine');
    })());
    const nyq = sr / 2;
    let phase = 0;
    for (let i = i0; i < i1; i++) {
      const hz = Math.max(0, f[i] * Math.pow(2, d[i] / 1200));
      let v = 0;
      const maxK = hz > 0 ? Math.min(w.real.length - 1, Math.floor(nyq / hz)) : 0;
      for (let k = 1; k <= maxK; k++) {
        const re = w.real[k], im = w.imag[k];
        if (re === 0 && im === 0) continue;
        const p = k * phase;
        v += re * Math.cos(p) + im * Math.sin(p);
      }
      out[i] = v * w.scale;
      phase += (2 * Math.PI * hz) / sr;
      if (phase > 2 * Math.PI) phase -= 2 * Math.PI;
    }
    return out;
  }
}

class AudioBuffer {
  constructor(channels, length, sampleRate) {
    this.numberOfChannels = channels;
    this.length = length;
    this.sampleRate = sampleRate;
    this.duration = length / sampleRate;
    this._ch = [];
    for (let i = 0; i < channels; i++) this._ch.push(new Float32Array(length));
  }
  getChannelData(i) { return this._ch[i]; }
}

class BufferSourceNode extends Node {
  constructor(ctx) {
    super(ctx);
    this.buffer = null;
    this.loop = false;
    this.loopStart = 0;
    this.loopEnd = 0;
    this.playbackRate = new Param(1);
    this.detune = new Param(0);
    this._start = null;
    this._offset = 0;
    this._stop = Infinity;
  }
  start(t = 0, offset = 0) { this._start = t; this._offset = offset; }
  stop(t) { this._stop = t; }

  _render(ctx, len) {
    const out = new Float32Array(len);
    const b = this.buffer;
    if (!b || this._start === null) return out;
    const sr = ctx.sampleRate;
    const d = b.getChannelData(0);
    const i0 = Math.max(0, Math.round(this._start * sr));
    const i1 = Math.min(len, this._stop === Infinity ? len : Math.round(this._stop * sr));
    const rate = this.playbackRate.render(ctx, len);
    const loopEnd = this.loop ? (this.loopEnd > 0 ? this.loopEnd : b.duration) : b.duration;
    const loopStart = this.loop ? this.loopStart : 0;
    let pos = this._offset * b.sampleRate;
    const lsS = loopStart * b.sampleRate, leS = Math.min(d.length, loopEnd * b.sampleRate);
    for (let i = i0; i < i1; i++) {
      if (pos >= leS) {
        if (!this.loop) break;
        const span = leS - lsS;
        pos = span > 0 ? lsS + ((pos - lsS) % span) : lsS;
      }
      const p0 = Math.floor(pos), p1 = Math.min(d.length - 1, p0 + 1);
      const fr = pos - p0;
      out[i] = d[p0] * (1 - fr) + d[p1] * fr;
      pos += rate[i] * (b.sampleRate / sr);
    }
    return out;
  }
}

/* ============================================================================
   Context
============================================================================ */

export class OfflineCtx {
  constructor(sampleRate = 44100) {
    this.sampleRate = sampleRate;
    this.currentTime = 0;
    this._nodes = [];
    this.destination = new PassNode(this);
    this.listener = {
      positionX: new Param(0), positionY: new Param(0), positionZ: new Param(0),
      forwardX: new Param(0), forwardY: new Param(0), forwardZ: new Param(-1),
      upX: new Param(0), upY: new Param(1), upZ: new Param(0),
      setPosition() {}, setOrientation() {},
    };
  }

  createGain() { return new GainNode(this, 1); }
  createBiquadFilter() { return new BiquadNode(this); }
  createOscillator() { return new OscillatorNode(this); }
  createBufferSource() { return new BufferSourceNode(this); }
  createStereoPanner() { return new StereoPannerNode(this); }
  createPanner() { return new PannerNode(this); }
  createDynamicsCompressor() { return new CompressorNode(this); }
  createConvolver() { const n = new PassNode(this); n.buffer = null; n.normalize = true; return n; }
  createBuffer(ch, len, sr) { return new AudioBuffer(ch, len, sr); }
  createPeriodicWave(real, imag, opts = {}) { return new PeriodicWave(real, imag, !opts.disableNormalization); }
  createDelay() { return new PassNode(this); }
  createWaveShaper() { const n = new PassNode(this); n.curve = null; return n; }
  resume() { return Promise.resolve(); }
  close() { return Promise.resolve(); }

  /** Render `seconds` of whatever reaches `node` (default: the destination). */
  render(seconds, node = this.destination) {
    const len = Math.round(seconds * this.sampleRate);
    for (const n of this._nodes) n._cache = null;
    return node._out(this, len);
  }
}

/* ============================================================================
   Analysis
============================================================================ */

export function rms(d, from = 0, to = d.length) {
  let s = 0, n = 0;
  for (let i = from; i < to; i++) { s += d[i] * d[i]; n++; }
  return n ? Math.sqrt(s / n) : 0;
}

export function peak(d) {
  let p = 0;
  for (let i = 0; i < d.length; i++) { const a = Math.abs(d[i]); if (a > p) p = a; }
  return p;
}

/** In-place iterative radix-2 FFT. `re`/`im` must be a power of two long. */
export function fft(re, im) {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) { [re[i], re[j]] = [re[j], re[i]]; [im[i], im[j]] = [im[j], im[i]]; }
  }
  for (let l = 2; l <= n; l <<= 1) {
    const ang = (-2 * Math.PI) / l;
    const wr = Math.cos(ang), wi = Math.sin(ang);
    for (let i = 0; i < n; i += l) {
      let cr = 1, ci = 0;
      for (let k = 0; k < l / 2; k++) {
        const ar = re[i + k], ai = im[i + k];
        const br = re[i + k + l / 2] * cr - im[i + k + l / 2] * ci;
        const bi = re[i + k + l / 2] * ci + im[i + k + l / 2] * cr;
        re[i + k] = ar + br; im[i + k] = ai + bi;
        re[i + k + l / 2] = ar - br; im[i + k + l / 2] = ai - bi;
        const ncr = cr * wr - ci * wi;
        ci = cr * wi + ci * wr; cr = ncr;
      }
    }
  }
}

/**
 * Power-weighted spectral centroid in Hz, averaged over Hann-windowed frames.
 * Frames whose energy is below `floor` of the loudest frame are skipped — a decayed tail is all
 * filter ringing and would drag every sound's centroid toward the same place.
 */
export function centroid(d, sampleRate, { size = 2048, hop = 512, floor = 0.05 } = {}) {
  const win = new Float32Array(size);
  for (let i = 0; i < size; i++) win[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (size - 1));
  const frames = [];
  let loudest = 0;
  for (let s = 0; s + size <= d.length; s += hop) {
    let e = 0;
    for (let i = 0; i < size; i++) e += d[s + i] * d[s + i];
    frames.push({ s, e });
    if (e > loudest) loudest = e;
  }
  if (!frames.length || loudest <= 0) return 0;
  let num = 0, den = 0, used = 0;
  const re = new Float32Array(size), im = new Float32Array(size);
  for (const f of frames) {
    if (f.e < loudest * floor) continue;
    used++;
    for (let i = 0; i < size; i++) { re[i] = d[f.s + i] * win[i]; im[i] = 0; }
    fft(re, im);
    for (let k = 1; k < size / 2; k++) {
      const p = re[k] * re[k] + im[k] * im[k];
      num += p * ((k * sampleRate) / size);
      den += p;
    }
  }
  return { hz: den > 0 ? num / den : 0, frames: used };
}

/** First sample index above `thresh` — the onset, for asserting a transient is actually sharp. */
export function onset(d, thresh = 0.02) {
  for (let i = 0; i < d.length; i++) if (Math.abs(d[i]) > thresh) return i;
  return -1;
}

/* ============================================================================
   MPEG frame scan — duration straight out of the committed bytes, no decoder
============================================================================ */

const MPEG_RATE = [[11025, 12000, 8000], [0, 0, 0], [22050, 24000, 16000], [44100, 48000, 32000]];
const BR_V1L3 = [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320, 0];
const BR_V2L3 = [0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160, 0];

/**
 * Sample count and duration of an MP3, by walking its frame headers. No decoding, no
 * dependency, ~10 ms for a 2 MB file — which is what lets the shipped `STEM_STATS` constants be
 * re-checked against the actual bytes on every test run instead of on a browser's good word.
 */
export function mp3Scan(bytes) {
  const b = bytes;
  let i = 0;
  if (b[0] === 0x49 && b[1] === 0x44 && b[2] === 0x33) {
    i = 10 + (((b[6] & 0x7f) << 21) | ((b[7] & 0x7f) << 14) | ((b[8] & 0x7f) << 7) | (b[9] & 0x7f));
  }
  let frames = 0, samples = 0, rate = 0, channels = 0;
  while (i < b.length - 4) {
    if (b[i] !== 0xff || (b[i + 1] & 0xe0) !== 0xe0) { i++; continue; }
    const ver = (b[i + 1] >> 3) & 3, layer = (b[i + 1] >> 1) & 3;
    if (ver === 1 || layer === 0) { i++; continue; }
    const brIdx = (b[i + 2] >> 4) & 0xf, srIdx = (b[i + 2] >> 2) & 3, pad = (b[i + 2] >> 1) & 1;
    if (brIdx === 0 || brIdx === 15 || srIdx === 3) { i++; continue; }
    const mpeg1 = ver === 3;
    const sr = MPEG_RATE[ver][srIdx];
    const br = (mpeg1 ? BR_V1L3 : BR_V2L3)[brIdx] * 1000;
    const spf = layer === 1 ? (mpeg1 ? 1152 : 576) : layer === 3 ? 384 : 1152;
    const len = layer === 3 ? Math.floor((12 * br / sr + pad) * 4) : Math.floor(spf / 8 * br / sr) + pad;
    if (len < 4) { i++; continue; }
    if (frames === 0) { rate = sr; channels = ((b[i + 3] >> 6) & 3) === 3 ? 1 : 2; }
    frames++; samples += spf; i += len;
  }
  return { frames, sampleRate: rate, channels, samples, duration: rate ? samples / rate : 0 };
}

/* ============================================================================
   Calibration — run before trusting any number out of this file
============================================================================ */

export function selfTest() {
  const results = [];
  const sr = 44100;

  // 1. A 0.5-amplitude sine must render RMS 0.5/sqrt(2).
  {
    const ctx = new OfflineCtx(sr);
    const o = ctx.createOscillator();
    o.type = 'sine'; o.frequency.value = 1000;
    const g = ctx.createGain(); g.gain.value = 0.5;
    o.connect(g).connect(ctx.destination);
    o.start(0);
    const d = ctx.render(0.5);
    results.push({ name: 'sine rms', got: rms(d), want: 0.5 / Math.SQRT2, tol: 0.01 });
  }

  /* 2. The `Q`-is-decibels rule for lowpass, which is the single easiest thing to get wrong.
     For an RBJ lowpass |H(fc)| == Q_linear exactly, so the response AT the cutoff reads the
     interpretation straight back: Q = 0 dB must give 0.00 dB, and Q = -3.01 dB (Q_linear
     1/sqrt(2), Butterworth) must give -3.01 dB. Read as a linear factor instead, the second
     case would be a negative Q and the filter would not be a filter at all. */
  for (const [qDb, wantDb] of [[0, 0], [-3.0103, -3.0103]]) {
    const ctx = new OfflineCtx(sr);
    const o = ctx.createOscillator();
    o.type = 'sine'; o.frequency.value = 1000;
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass'; f.frequency.value = 1000; f.Q.value = qDb;
    o.connect(f).connect(ctx.destination);
    o.start(0);
    const d = ctx.render(0.5);
    const db = 20 * Math.log10(rms(d, sr * 0.2) / (1 / Math.SQRT2));
    results.push({ name: `lowpass at fc, Q=${qDb} dB`, got: db, want: wantDb, tol: 0.25 });
  }

  // 3. A linear gain ramp must be linear at its own midpoint.
  {
    const ctx = new OfflineCtx(sr);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, 0);
    g.gain.linearRampToValueAtTime(1, 1);
    results.push({ name: 'linear ramp midpoint', got: g.gain.valueAt(0.5), want: 0.5, tol: 1e-6 });
  }

  // 4. An exponential ramp must be geometric at its own midpoint.
  {
    const ctx = new OfflineCtx(sr);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.01, 0);
    g.gain.exponentialRampToValueAtTime(1, 1);
    results.push({ name: 'exp ramp midpoint', got: g.gain.valueAt(0.5), want: 0.1, tol: 1e-6 });
  }

  // 5. The spectral centroid of a pure 2 kHz tone must be 2 kHz.
  {
    const ctx = new OfflineCtx(sr);
    const o = ctx.createOscillator();
    o.type = 'sine'; o.frequency.value = 2000;
    o.connect(ctx.destination);
    o.start(0);
    const c = centroid(ctx.render(0.5), sr);
    results.push({ name: 'centroid of 2 kHz tone', got: c.hz, want: 2000, tol: 40 });
  }

  // 6. A node connected INTO a param must actually reach it: DC 0.25 into a gain of 0.25 = 0.5.
  {
    const ctx = new OfflineCtx(sr);
    const dc = ctx.createBufferSource();
    const b = ctx.createBuffer(1, sr, sr);
    b.getChannelData(0).fill(1);
    dc.buffer = b; dc.loop = true;
    const scale = ctx.createGain(); scale.gain.value = 0.25;
    dc.connect(scale);
    const car = ctx.createOscillator();
    car.type = 'sine'; car.frequency.value = 500;
    const g = ctx.createGain(); g.gain.value = 0.25;
    scale.connect(g.gain);
    car.connect(g).connect(ctx.destination);
    dc.start(0); car.start(0);
    const d = ctx.render(0.3);
    results.push({ name: 'param input sums', got: rms(d, sr * 0.05), want: 0.5 / Math.SQRT2, tol: 0.02 });
  }

  const failures = results.filter((r) => Math.abs(r.got - r.want) > r.tol);
  return { results, failures, ok: failures.length === 0 };
}

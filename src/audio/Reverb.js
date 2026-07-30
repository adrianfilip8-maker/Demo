import { rng } from '../core/Rand.js';
import { cache, dcKill, fadeEdges, peakOf } from './Synth.js';

/**
 * Reverb — procedurally generated impulse responses, one per space.
 *
 * No downloaded IR files (AGENTS.md §1), and no algorithmic reverb either: a
 * convolver with a hand-built IR gives control over the two things that actually
 * sell a room, which a Schroeder/FDN network hides from you —
 *
 *   **Early reflections.** The first ~40 ms is the room's geometry. A courtyard
 *   has a handful of hard slaps off distant walls; a tomb has a dense cloud of
 *   close ones. Get this wrong and every space sounds like "reverb" instead of
 *   like somewhere.
 *
 *   **Frequency-dependent decay.** Air and sandstone eat treble far faster than
 *   bass, so the tail must get darker as it decays. A flat-spectrum decaying
 *   noise burst is the single most recognisable "cheap reverb" artefact there is.
 */

/**
 * seconds   IR length
 * decay     e-folding rate (higher = shorter tail)
 * predelay  gap before the first reflection — reads as room size
 * taps      number of early reflections
 * spread    seconds the early reflections occupy
 * damp      lowpass corner at t=0, Hz; falls exponentially through the tail
 * lowcut    high-pass on the whole IR
 * wet       default send level for the space
 * width     stereo decorrelation, 0 = mono
 */
export const SPACES = {
  courtyard: { seconds: 2.0, decay: 3.1, predelay: 0.016, taps: 9,  spread: 0.11, damp: 4600, lowcut: 95,  wet: 0.24, width: 0.92, tilt: 1.0 },
  hall:      { seconds: 3.2, decay: 2.2, predelay: 0.023, taps: 15, spread: 0.16, damp: 2700, lowcut: 72,  wet: 0.34, width: 0.78, tilt: 1.5 },
  tomb:      { seconds: 2.4, decay: 2.8, predelay: 0.007, taps: 20, spread: 0.05, damp: 1500, lowcut: 55,  wet: 0.44, width: 0.5,  tilt: 2.2 },
  outdoor:   { seconds: 1.2, decay: 5.4, predelay: 0.032, taps: 4,  spread: 0.24, damp: 5400, lowcut: 120, wet: 0.11, width: 1.0,  tilt: 0.6 },
};

export const SPACE_NAMES = Object.keys(SPACES);

/**
 * Build a stereo IR for a named space. Cached per context — each one is a few
 * hundred thousand samples of arithmetic and they never change.
 */
export function impulseResponse(ctx, name = 'courtyard', seed = 0x5a4d) {
  const spec = SPACES[name] || SPACES.courtyard;
  const c = cache(ctx);
  const key = `${name}|${ctx.sampleRate}`;
  const hit = c.ir.get(key);
  if (hit) return hit;

  const sr = ctx.sampleRate;
  const n = Math.round(spec.seconds * sr);
  const buf = ctx.createBuffer(2, n, sr);

  for (let ch = 0; ch < 2; ch++) {
    const d = buf.getChannelData(ch);
    // Different seed per channel is what makes the tail stereo. Same seed twice
    // would give a mono reverb in a stereo wrapper.
    const r = rng(seed + name.length * 7919 + ch * 104729);

    /* ---- diffuse tail: noise, exponentially decaying, progressively darkened ---- */
    let lp = 0, lp2 = 0;
    for (let i = 0; i < n; i++) {
      const t = i / sr;
      const w = r() * 2 - 1;
      // Damping corner slides down through the tail: the room eats treble over time.
      const fc = Math.max(240, spec.damp * Math.exp(-t * spec.tilt));
      const a = 1 - Math.exp((-2 * Math.PI * fc) / sr);
      lp += a * (w - lp);
      lp2 += a * (lp - lp2);            // 2-pole: 12 dB/oct, a believable air slope
      const envelope = Math.exp(-spec.decay * t);
      d[i] = lp2 * envelope;
    }

    /* ---- early reflections ---- */
    // Each is a short filtered noise grain, not a naked impulse: a real reflection
    // off carved sandstone is diffuse and dull, a single sample is a bright tick.
    for (let k = 0; k < spec.taps; k++) {
      const frac = (k + r() * 0.8) / spec.taps;
      const at = Math.round((spec.predelay + frac * spec.spread) * sr);
      if (at >= n - 64) continue;
      const amp = (0.85 / (1 + frac * 5.5)) * (0.55 + r() * 0.65) * (r() < 0.4 ? -1 : 1);
      const len = Math.max(20, Math.round(sr * (0.0008 + r() * 0.0035)));
      let g = 0;
      const tone = 0.25 + r() * 0.5;
      for (let i = 0; i < len && at + i < n; i++) {
        const w = r() * 2 - 1;
        g += tone * (w - g);
        d[at + i] += g * Math.exp((-5 * i) / len) * amp * 1.6;
      }
    }

    /* ---- direct-path guard ---- */
    // No energy before the predelay: that gap is what the ear reads as distance.
    const guard = Math.max(1, Math.round(spec.predelay * sr * 0.85));
    for (let i = 0; i < guard; i++) d[i] *= i / guard;

    dcKill(d, sr, spec.lowcut);
    // A tail that stops must stop *smoothly*, or the room ends with a click.
    fadeEdges(d, sr, 0.0002, Math.min(0.25, spec.seconds * 0.16));
  }

  /* ---- stereo width + normalisation ---- */
  const L = buf.getChannelData(0), R = buf.getChannelData(1);
  if (spec.width < 1) {
    const k = spec.width * 0.5;
    for (let i = 0; i < n; i++) {
      const m = (L[i] + R[i]) * 0.5, s = (L[i] - R[i]) * k;
      L[i] = m + s; R[i] = m - s;
    }
  }
  const pk = Math.max(peakOf(L), peakOf(R)) || 1;
  const g = 0.9 / pk;
  for (let i = 0; i < n; i++) { L[i] *= g; R[i] *= g; }

  c.ir.set(key, buf);
  return buf;
}

/**
 * A two-convolver rack that crossfades between spaces.
 *
 * Swapping a single ConvolverNode's buffer truncates its tail dead — extremely
 * audible when you walk through a doorway, which is precisely when it happens.
 * So: two convolvers, the outgoing one keeps ringing its old IR while its gain
 * falls, and the incoming one rises. The old buffer is left loaded rather than
 * nulled; a stale IR at zero gain costs nothing and can't leak.
 */
export class ReverbRack {
  constructor(ctx, destination, { space = 'courtyard', fade = 1.6 } = {}) {
    this.ctx = ctx;
    this.fadeTime = fade;
    this.space = space;

    this.input = ctx.createGain();
    this.input.gain.value = 1;

    // Rooms are darker than the direct sound; without this the wet path is fizzy.
    this.tone = ctx.createBiquadFilter();
    this.tone.type = 'highshelf';
    this.tone.frequency.value = 3600;
    this.tone.gain.value = -5;

    this.output = ctx.createGain();
    this.output.gain.value = 1;
    this.tone.connect(this.output);
    this.output.connect(destination);

    this._slots = [];
    for (let i = 0; i < 2; i++) {
      const conv = ctx.createConvolver();
      conv.normalize = true;
      const g = ctx.createGain();
      g.gain.value = 0;
      this.input.connect(conv);
      conv.connect(g);
      g.connect(this.tone);
      this._slots.push({ conv, g, name: null });
    }

    this._active = 0;
    const ir = impulseResponse(ctx, space);
    this._slots[0].conv.buffer = ir;
    this._slots[0].name = space;
    this._slots[0].g.gain.value = SPACES[space]?.wet ?? 0.25;
  }

  /** Current send level for the active space — the mixer uses it to set send gains. */
  get wet() { return SPACES[this.space]?.wet ?? 0.25; }

  setSpace(name, fade = this.fadeTime) {
    if (!SPACES[name] || name === this.space) return;
    const t = this.ctx.currentTime;
    const cur = this._slots[this._active];
    const next = this._slots[1 - this._active];

    if (next.name !== name) {
      next.conv.buffer = impulseResponse(this.ctx, name);
      next.name = name;
    }
    const wet = SPACES[name].wet;

    cur.g.gain.cancelScheduledValues(t);
    cur.g.gain.setValueAtTime(cur.g.gain.value, t);
    cur.g.gain.linearRampToValueAtTime(0, t + fade);

    next.g.gain.cancelScheduledValues(t);
    next.g.gain.setValueAtTime(next.g.gain.value, t);
    next.g.gain.linearRampToValueAtTime(wet, t + fade);

    this._active = 1 - this._active;
    this.space = name;
  }

  dispose() {
    try { this.input.disconnect(); } catch {}
    for (const s of this._slots) {
      try { s.conv.disconnect(); } catch {}
      try { s.g.disconnect(); } catch {}
      s.conv.buffer = null;
    }
    try { this.tone.disconnect(); } catch {}
    try { this.output.disconnect(); } catch {}
  }
}

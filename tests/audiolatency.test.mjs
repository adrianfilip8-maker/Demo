/**
 * audiolatency.test.mjs — §550. How long from `unlock()` to the first audible sample?
 *
 * The user's report from a live playtest: *"The music and sounds take a while to begin playing."*
 * §548 established the audio system works and is the best-tested part of this project. **When it
 * starts had never been measured**, in either channel.
 *
 * These arms measure the half that is `src/audio/`'s: once a context exists, how fast does sound
 * come out? They deliberately do NOT measure boot, the gesture, the network or `decodeAudioData` —
 * those are the browser's half and live in `tools/audiostart.mjs`, because a container that
 * rasterises in software cannot produce a number for them that means anything on the user's
 * machine (§544's standing rule).
 *
 * The measured split, which is the point:
 *
 *     SFX               ~5 ms      one-shot, fully synthesised, needs nothing but the graph
 *     ambience beds     ~28 ms     (~9 ms at a 10x lower threshold; these figures are |x| > 1e-3)
 *     procedural score  ~121 ms    the look-ahead scheduler's first bar
 *
 * None of that is slow. What the player waits for is elsewhere, and is named in §550's ledger.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { OfflineCtx, peak } from './webaudio.mjs';

const SR = 44100;

function stubEngine() {
  const handlers = new Map(), modules = new Map();
  return {
    quality: 'high', dt: 1 / 60, warnings: [], scene: null, camera: null,
    on(evt, fn) { if (!handlers.has(evt)) handlers.set(evt, []); handlers.get(evt).push(fn); return () => {}; },
    emit(evt, p) { for (const fn of handlers.get(evt) || []) fn(p); },
    get(n) { return modules.get(n) || null; },
    set(n, m) { modules.set(n, m); },
    warn(m) { this.warnings.push(m); },
  };
}

const { Audio } = await import('../src/audio/Audio.js');

/**
 * Boot the SHIPPING graph on an offline context — the door `Audio.unlock(existing)` exists for,
 * the same one `audio.test.mjs` uses. `opts.quiet` suppresses a channel so the other can be timed
 * without being masked by it.
 */
async function boot({ noBeds = false, noScore = false } = {}) {
  const engine = stubEngine();
  const a = new Audio(engine);
  a.available = true;
  await a.init();
  if (noBeds) a._startBeds = () => {};
  if (noScore) a.music = () => {};
  const ctx = new OfflineCtx(SR);
  const ok = a.unlock(ctx);
  assert.ok(ok, `unlock() failed: ${engine.warnings.join('; ')}`);
  return { a, ctx, engine };
}

/**
 * Tick the module the way the frame loop does.
 *
 * **This is the fault this file exists to not repeat.** `Music.update(now)` is a LOOK-AHEAD
 * scheduler (0.45 s) driven only from `Audio.update()`. The first version of the §550 probe never
 * called it, so the procedural score rendered *pure silence* and very nearly went into the ledger
 * as "the documented fallback makes no sound at all". It is the same shape as §549's control card
 * that "fits" while never having opened: the world being measured had no frames in it. `OfflineCtx`
 * exposes `currentTime` as a plain field, so the clock can be walked by hand and then rewound for
 * the render, which reads absolute schedule times.
 */
function pump(a, ctx, seconds, dt = 1 / 60) {
  for (let t = 0; t < seconds; t += dt) { ctx.currentTime = t; a.update(dt); }
  ctx.currentTime = 0;
}

/** First sample whose magnitude exceeds `thresh`, in ms. `Infinity` if never. */
function firstAudibleMs(d, thresh) {
  for (let i = 0; i < d.length; i++) if (Math.abs(d[i]) > thresh) return (i / SR) * 1000;
  return Infinity;
}

const AUDIBLE = 1e-3;      // well above the graph's noise floor, well below anything intended

test('L0 control: an idle graph is silent, so a latency of "0 ms" cannot be the instrument', async () => {
  /* Without this, every number below could mean "sound arrived fast" OR "this harness reports an
     onset for anything". The graph is built and NOTHING is asked to play. */
  const { ctx } = await boot({ noBeds: true, noScore: true });
  const d = ctx.render(3);
  assert.equal(peak(d), 0,
    `an idle graph rendered a peak of ${peak(d)} — every latency in this file would be noise`);
  assert.equal(firstAudibleMs(d, 1e-6), Infinity, 'the idle graph produced an onset');
});

test('L1 SFX: a one-shot is audible within 20 ms of unlock', async () => {
  /* ── DOMAIN (§418.3) ──────────────────────────────────────────────────────────────────────
   *   passes on : `play('land_soft')` issued the instant the context exists, rendered through the
   *               shipping pool/pan/send/limiter chain, audible in ~5 ms.
   *   fails  on : RUN in-arm below — the same render with nothing played, which must never report
   *               an onset. That is what separates "the SFX is fast" from "this counts anything".
   *   verdict   : SFX are synthesised and need no decode, so they are bounded by the graph alone.
   *               If the player reports late SOUNDS, the cause is not here.
   *   does NOT  : discriminate audibility to a human — level, masking and placement are
   *   discrim.    `audio.test.mjs`'s. This is an onset time, not a loudness.
   */
  const { a, ctx } = await boot({ noBeds: true, noScore: true });
  a.play('land_soft');
  const d = ctx.render(2);
  const ms = firstAudibleMs(d, AUDIBLE);
  assert.ok(ms < 20, `a one-shot took ${ms.toFixed(1)} ms to become audible after unlock`);

  const { ctx: quiet } = await boot({ noBeds: true, noScore: true });
  assert.equal(firstAudibleMs(quiet.render(2), AUDIBLE), Infinity,
    'the same harness reported an onset with nothing played — it counts anything');
  console.log(`  [L1] SFX audible ${ms.toFixed(1)} ms after unlock`);
});

test('L2 beds: room ambience is audible within 50 ms of unlock', async () => {
  const { ctx } = await boot({ noScore: true });
  const d = ctx.render(3);
  const ms = firstAudibleMs(d, AUDIBLE);
  assert.ok(ms < 50, `the ambience beds took ${ms.toFixed(1)} ms to become audible`);
  console.log(`  [L2] beds audible ${ms.toFixed(1)} ms after unlock`);
});

test('L3 the procedural score DOES sound, and covers the gap before any stem arrives', async () => {
  /* ── DOMAIN (§418.3) ──────────────────────────────────────────────────────────────────────
   *   passes on : the score alone — beds suppressed — becoming audible inside 400 ms of unlock,
   *               with bars actually scheduled, when the module is ticked at 60 Hz.
   *   fails  on : RUN in-arm below — the identical arm with `pump()` REMOVED, which renders
   *               silence. That is not a bug in the score; it is the instrument fault this file
   *               documents, and it is asserted so the fix cannot be quietly undone.
   *   verdict   : `Audio.unlock()` starts this score before it ever asks for an MP3, so music is
   *               NOT waiting on a 2.24 MB fetch. What waits on the fetch is the *recognisable*
   *               track, plus `Audio.js`'s deliberate 4.0 s cross-fade.
   *   does NOT  : discriminate whether a listener finds the procedural score satisfying, or
   *   discrim.    notices it at all under the beds. That is a playtest question.
   */
  const { a, ctx } = await boot({ noBeds: true });
  pump(a, ctx, 12);
  const d = ctx.render(12);
  const ms = firstAudibleMs(d, AUDIBLE);
  assert.ok(a.score?._started, 'unlock() did not start the procedural score at all');
  assert.ok(ms < 400, `the procedural score took ${ms.toFixed(1)} ms to become audible`);
  assert.ok(peak(d) > 0.05, `the score rendered a peak of only ${peak(d).toFixed(4)}`);

  /* The calibration: WITHOUT the pump, this same arm renders silence. */
  const { ctx: unpumped } = await boot({ noBeds: true });
  const dq = unpumped.render(12);
  assert.equal(peak(dq), 0,
    'an unpumped score rendered sound — the look-ahead scheduler no longer needs Audio.update(), '
    + 'so L3 has stopped testing what its comment says it tests');
  console.log(`  [L3] procedural score audible ${ms.toFixed(1)} ms after unlock, peak ${peak(d).toFixed(3)}, `
    + `bars ${a.score?._bar}  ·  unpumped it is silent, which is the instrument fault, not the score`);
});

test('L4 the stem cross-fade is 4.0 s, and that is the biggest term the player waits through', () => {
  /* Not a timing measurement — a reading of the constant, pinned so the ledger's arithmetic and
     the code cannot drift apart. §550 reports the recognisable track arriving at roughly
     fetch + decode + this, and this is the term that does not shrink on a faster machine. */
  const src = readFileSync(new URL('../src/audio/Audio.js', import.meta.url), 'utf8');
  const m = /First stem in also retires the synthesised score[\s\S]{0,400}?const FADE = ([\d.]+);/.exec(src);
  assert.ok(m, 'could not find the first-stem cross-fade constant in Audio.js');
  assert.equal(Number(m[1]), 4.0,
    `the first-stem cross-fade is now ${m[1]} s — §550's arithmetic quotes 4.0 s and must be re-stated`);
  console.log(`  [L4] first-stem cross-fade ${m[1]} s (unchanged; a feel constant, priced not altered in §550)`);
});

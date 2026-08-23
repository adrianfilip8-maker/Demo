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

/* ====================================================================== */
/* §551 — the gesture that used to be thrown away, and the prefetch guard */
/* ====================================================================== */

/**
 * A window just wide enough for `_armGesture` and `_prefetchStem`, installed per-test and torn
 * down after, so the arms above keep running in a Node with no `window` at all.
 */
function installWindow({ search = '', withAudioCtor = true } = {}) {
  const listeners = new Map();
  const fetches = [];
  const win = {
    location: { search },
    addEventListener: (t, fn) => { if (!listeners.has(t)) listeners.set(t, new Set()); listeners.get(t).add(fn); },
    removeEventListener: (t, fn) => listeners.get(t)?.delete(fn),
    dispatch: (t) => { for (const fn of [...(listeners.get(t) ?? [])]) fn({ type: t }); },
    count: (t) => (listeners.get(t)?.size ?? 0),
  };
  if (withAudioCtor) win.AudioContext = function () { return new OfflineCtx(SR); };
  const prevWin = globalThis.window, prevFetch = globalThis.fetch;
  globalThis.window = win;
  globalThis.fetch = (url) => { fetches.push(String(url)); return Promise.resolve({ ok: false, status: 599 }); };
  return {
    win, fetches,
    restore() { globalThis.window = prevWin; globalThis.fetch = prevFetch; },
  };
}

test('L5 §551: a gesture during boot unlocks audio, instead of being thrown away', async () => {
  /* ── DOMAIN (§418.3) ──────────────────────────────────────────────────────────────────────
   *   passes on : a real `pointerdown` dispatched on the window AFTER `init()` and with no other
   *               help, leaving the mixer ready — i.e. the click a player aims at the progress bar
   *               now starts audio instead of hitting a handler that does not exist yet.
   *   fails  on : RUN in-arm — the identical setup with the gesture never dispatched, which must
   *               leave the mixer NOT ready. Without that clause an implementation that unlocked
   *               during `init()` regardless would pass, and that is a different (worse) change.
   *   verdict   : `main.js:306` registers its listener after every module initialises, so the
   *               ceiling in §550 was an ORDERING artifact rather than a platform limit. This is
   *               the half `src/audio/` owns; pointer lock stays `main.js`'s and is untouched.
   *   does NOT  : discriminate the browser's autoplay policy. This container applies none, and
   *   discrim.    forcing `--autoplay-policy=user-gesture-required` does not change that because
   *               there is no audio device — the §551 probe voided itself on its own calibration
   *               twice rather than answer. That is exactly why `unlock()` is called from INSIDE
   *               the handler: the design does not depend on the answer.
   */
  const W = installWindow();
  try {
    const engine = stubEngine();
    const a = new Audio(engine);
    /* ARMED AT CONSTRUCTION, and this assertion is the one that matters. The first version armed
       in `init()`, which passed this test and was still nearly useless in the real page: `main.js`
       constructs all 31 modules in one loop and initialises them in a SECOND, and `audio` is 30th,
       so the listener came up in the last moments of boot. A browser run clicking 2 s into a 34 s
       boot still lost the click. Asserting BEFORE init() is what stops that placement returning. */
    assert.ok(W.win.count('pointerdown') > 0,
      'the gesture listener is not armed at construction — in the real page it would arm after ~30 '
      + 'module inits, which is the placement a browser run already caught as too late');
    a.available = true;
    await a.init();
    assert.equal(a.ready, false, 'construction or init unlocked audio on its own — the gesture must be what does it');

    W.win.dispatch('pointerdown');
    assert.equal(a.ready, true, 'a gesture during boot did not unlock audio');
    assert.equal(W.win.count('pointerdown'), 0, 'the gesture listener did not disarm itself after firing');

    a.dispose();
  } finally { W.restore(); }

  /* The counterexample: no gesture, no unlock. */
  const W2 = installWindow();
  try {
    const a2 = new Audio(stubEngine());
    a2.available = true;
    await a2.init();
    assert.equal(a2.ready, false, 'audio unlocked with no gesture at all');
    a2.dispose();
  } finally { W2.restore(); }
  console.log('  [L5] a boot-time pointerdown unlocks the mixer; without one it stays locked');
});

test('L6 §551: the stem prefetch runs for a player and is GUARDED OFF for the capture harness', async () => {
  /* ── DOMAIN (§418.3) ──────────────────────────────────────────────────────────────────────
   *   passes on : `update()`'s not-ready branch issuing exactly one fetch for the explore stem
   *               on an ordinary page load, and issuing NONE when the URL carries `?shot`.
   *   fails  on : RUN in-arm — both halves are asserted against each other, so a guard that is
   *               written but not wired reddens here rather than costing a critic set 2.24 MB x 16.
   *   verdict   : the guard is the job. `unlock(existing)` already declines `_loadTrack` for this
   *               reason; this tests the same discriminator `main.js` uses rather than a second
   *               policy that could drift from it.
   *   does NOT  : discriminate whether the prefetch is FASTER in a real browser — that is
   *   discrim.    `tools/audiostart.mjs`, and network time is the user's machine's, not this box's.
   */
  /* a) an ordinary page load: one fetch, and only one however many frames run */
  const W = installWindow({ search: '' });
  try {
    const a = new Audio(stubEngine());
    a.available = true;
    await a.init();
    for (let i = 0; i < 5; i++) a.update(1 / 60);
    assert.equal(W.fetches.length, 1, `expected exactly one prefetch, saw ${W.fetches.length}: ${W.fetches.join(', ')}`);
    assert.match(W.fetches[0], /assets\/audio\/bc-explore\.mp3$/, `prefetched the wrong asset: ${W.fetches[0]}`);
    a.dispose();
  } finally { W.restore(); }

  /* b) the capture harness: ?shot, and not a byte */
  const S = installWindow({ search: '?shot=1&q=high' });
  try {
    const a = new Audio(stubEngine());
    a.available = true;
    await a.init();
    for (let i = 0; i < 5; i++) a.update(1 / 60);
    assert.deepEqual(S.fetches, [],
      `the capture harness prefetched ${S.fetches.length} asset(s) — 2.24 MB x 16 boots for a signal no frame can show`);
    a.dispose();
  } finally { S.restore(); }
  console.log('  [L6] prefetch: 1 fetch on a normal load, 0 under ?shot');
});

test('L7 §551: a prefetched buffer is spent once, and a failed prefetch still leaves music working', async () => {
  /* `decodeAudioData` DETACHES the ArrayBuffer it is given, so a retained entry would decode to
     nothing the second time round. The map must give the bytes up on use. */
  const W = installWindow();
  try {
    const a = new Audio(stubEngine());
    a.available = true;
    await a.init();
    a._bytes.set('explore', new ArrayBuffer(8));
    assert.equal(a._bytes.size, 1);
    /* Unlock on an offline context so `_loadTrack` is not reached, then drive it directly. */
    a.unlock(new OfflineCtx(SR));
    a.ctx.decodeAudioData = async () => { throw new Error('decode refused (probe)'); };
    await a._loadTrack('explore');
    assert.equal(a._bytes.size, 0, 'the prefetched bytes were not spent — a second decode would get a detached buffer');
    assert.ok(a.score?._started, 'a failed stem left no music at all; the procedural score must continue');
    a.dispose();
  } finally { W.restore(); }
  console.log('  [L7] prefetched bytes are spent on use; a failed stem leaves the score playing');
});

test('L8 §551: a mid-boot unlock does not fetch the stem until frames are running', async () => {
  /* ── DOMAIN (§418.3) ──────────────────────────────────────────────────────────────────────
   *   passes on : unlocking with no frame yet ticked issuing ZERO fetches, and the first
   *               `update()` then issuing exactly one.
   *   fails  on : RUN in-arm — the offline/capture context, which must issue none EVER, however
   *               many frames run. That is the same guard `unlock(existing)` has always had, and
   *               deferring the fetch is exactly the change that could have leaked past it.
   *   verdict   : §551 lets a gesture during boot unlock audio. An unconditional fetch there would
   *               pull 2.24 MB alongside the level's own asset loading and make BOOT slower — and
   *               boot is the dominant term in §550. Earlier music is not worth a later game.
   *   does NOT  : discriminate bandwidth contention itself, which is the user's network and not
   *   discrim.    this box's. This pins the ORDERING that avoids it.
   */
  const W = installWindow();
  try {
    const a = new Audio(stubEngine());
    a.available = true;
    await a.init();
    W.fetches.length = 0;                       // ignore any prefetch; this arm is about the stem
    a.unlock();                                 // mid-boot: no frame has ticked
    assert.ok(a.ready, 'unlock() failed in the stub window');
    assert.deepEqual(W.fetches, [],
      `unlocking mid-boot fetched ${W.fetches.length} asset(s) — that competes with boot's own loading`);

    a.update(1 / 60);
    assert.equal(W.fetches.length, 1, `the first frame should kick exactly one stem load, saw ${W.fetches.length}`);
    a.update(1 / 60); a.update(1 / 60);
    assert.equal(W.fetches.length, 1, 'the stem load is being kicked more than once');
    a.dispose();
  } finally { W.restore(); }

  /* The capture harness: an offline context, and not a byte however long it runs. */
  const S = installWindow({ search: '?shot=1' });
  try {
    const a = new Audio(stubEngine());
    a.available = true;
    await a.init();
    a.unlock(new OfflineCtx(SR));
    for (let i = 0; i < 10; i++) a.update(1 / 60);
    assert.deepEqual(S.fetches, [],
      `the offline/capture path fetched ${S.fetches.length} asset(s) — unlock(existing) has always declined this`);
    a.dispose();
  } finally { S.restore(); }
  console.log('  [L8] mid-boot unlock: 0 fetches until the first frame, then exactly 1; offline path: 0 ever');
});

/* ====================================================================== */
/* §552 — the pad has no gesture                                          */
/* ====================================================================== */

test('L9 §552: a pad-only player reaches audio, on the one signal a pad produces', async () => {
  /* ── DOMAIN (§418.3) ──────────────────────────────────────────────────────────────────────
   *   passes on : `inputDevice: 'pad'` on the bus creating the context, with NONE of the three
   *               DOM gesture listeners having fired — which is the pad-only player's whole
   *               situation, since a gamepad button is polled and dispatches no DOM event.
   *   fails  on : RUN in-arm — the same bus event carrying 'kbm', which must NOT unlock, so this
   *               cannot pass by unlocking on any event at all.
   *   verdict   : §551 armed pointerdown/keydown/touchstart and a pad fires none of them. This is
   *               the reachable signal: `Input._press(a,'pad')` -> `_setDevice('pad')` -> emit.
   *   does NOT  : discriminate whether the browser HONOURS resume() without a qualifying gesture.
   *   discrim.    §551 established this container applies no autoplay policy and that forcing the
   *               flag changes nothing with no audio device. L11 covers the branch where it is
   *               refused; neither can be verified here, which is why the design works either way.
   */
  const W = installWindow();
  try {
    const engine = stubEngine();
    const a = new Audio(engine);
    a.available = true;
    await a.init();
    assert.equal(a.ready, false, 'audio was already unlocked before any input');
    const gestureListeners = W.win.count('pointerdown') + W.win.count('keydown') + W.win.count('touchstart');
    assert.ok(gestureListeners > 0, 'the §551 DOM listeners are not armed at all');

    engine.emit('inputDevice', 'pad');
    assert.ok(a.ready, 'a pad press did not reach audio — a pad-only player has no path to sound');
    /* and not one of the DOM gestures was involved */
    assert.equal(W.win.fired ?? 0, 0, 'a DOM gesture handler ran; this arm is not testing the pad path');
    a.dispose();
  } finally { W.restore(); }

  /* The counterexample: a keyboard device change must NOT unlock. */
  const W2 = installWindow();
  try {
    const engine = stubEngine();
    const a = new Audio(engine);
    a.available = true;
    await a.init();
    engine.emit('inputDevice', 'kbm');
    assert.equal(a.ready, false,
      'a kbm device change unlocked audio — this would pass by unlocking on anything at all');
    a.dispose();
  } finally { W2.restore(); }
  console.log('  [L9] inputDevice:pad creates the context with no DOM gesture; kbm does not');
});

test('L10 §552: a repeat unlock() retries resume instead of returning flat', async () => {
  /* The trap this closes. `unlock()` used to open with `if (this.ctx) return this.ready`, which was
     harmless only while nothing could create a context without a gesture. §552 makes a POLLED pad
     press create one — and if the platform refuses to resume it, that context is born suspended.
     Under the old early return the later, genuine click came back through here, hit it, and never
     resumed: silent for the life of the page, with `ready` reporting true. */
  const W = installWindow();
  try {
    const a = new Audio(stubEngine());
    a.available = true;
    await a.init();

    const ctx = new OfflineCtx(SR);
    let resumes = 0;
    ctx.resume = () => { resumes++; return Promise.resolve(); };
    a.unlock(ctx);
    const first = resumes;
    assert.ok(first >= 1, 'the first unlock() never asked the context to resume');

    a.unlock();                      // the later, genuine gesture
    assert.ok(resumes > first,
      `a repeat unlock() did not retry resume (${resumes} calls) — a suspended context would stay silent forever`);
    a.dispose();
  } finally { W.restore(); }
  console.log('  [L10] repeat unlock() retries resume');
});

test('L11 §552: while the context is not audible, the DOM listeners stay armed', async () => {
  /* If a polled pad press creates a SUSPENDED context, the only thing that can start it is a real
     gesture — so the gesture listeners must survive. Disarming on the first `unlock()` would throw
     that click away, which is §551's own mistake one layer down. */
  const W = installWindow();
  try {
    const a = new Audio(stubEngine());
    a.available = true;
    await a.init();
    const armed = () => W.win.count('pointerdown');
    assert.ok(armed() > 0, 'listeners were never armed');

    /* A context that models suspension and refuses to leave it. */
    const ctx = new OfflineCtx(SR);
    ctx.state = 'suspended';
    ctx.resume = () => Promise.resolve();
    a.unlock(ctx);
    assert.equal(a.audible, false, 'a suspended context reported itself audible');
    W.win.dispatch('pointerdown');
    assert.ok(armed() > 0,
      'the DOM listeners disarmed while the context was still suspended — the real click that could '
      + 'have started it would now be swallowed');

    /* Once it does run, they retire. */
    ctx.state = 'running';
    assert.equal(a.audible, true, 'a running context did not report itself audible');
    W.win.dispatch('pointerdown');
    assert.equal(armed(), 0, 'the listeners never retire, so they leak for the life of the page');
    a.dispose();
  } finally { W.restore(); }
  console.log('  [L11] listeners persist while suspended and retire once running');
});

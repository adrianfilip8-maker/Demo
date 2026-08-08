/**
 * TextureWorker — one background thread that turns a recipe name into finished byte buffers.
 *
 * Why this exists: the procedural catalogue is ~25 s of single-threaded arithmetic at
 * `texSize 1024`, and it all used to run on the main thread during `Textures.init()`, which is
 * why the boot warning read `textures: prewarm took 29.6s` and first-frame times reached 29 s.
 * The work is embarrassingly parallel — every recipe is a pure function of its name and seed,
 * shares nothing, and touches no GPU object — so it belongs off the main thread. Nothing here
 * imports `three`; see `Bake.js` for why.
 *
 * **Two things are load-bearing and easy to get wrong.**
 *
 * 1. **The canvas.** `Canvas2D.mkCanvas` prefers `OffscreenCanvas`, which is exactly what a
 *    worker has (and a worker has no `document`, so there is no other branch to take). The
 *    shipped main-thread path already took the `OffscreenCanvas` branch — Chrome exposes the
 *    constructor on the window too — so the glyph rasteriser is running on the same Skia path in
 *    both places, not on two different ones. Verified by hash, not by argument: all 23 prewarmed
 *    recipes hash identically built here and built on the main thread.
 *
 * 2. **The A/B flag.** `Canvas2D.abRaw()` reads `globalThis.__TEX_AB` first and
 *    `import.meta.env.VITE_TEX_AB` second. A worker gets its own global scope, so a lab that sets
 *    `__TEX_AB` on the main thread before booting would have had its treatment silently ignored
 *    in here — a control arm that renders as the treatment arm, which is the §46 shape: an
 *    instrument that cannot distinguish its own two inputs. The pool therefore ships the raw
 *    string with every job and it is installed before `bake()` runs.
 */

import { bake, bakeTransfers } from './Bake.js';

self.onmessage = (e) => {
  const { id, name, texSize, quality, ab } = e.data || {};
  // Install the A/B arm before any recipe reads it. `''` is the shipped value and means
  // "every treatment on"; `null`/undefined means the host had nothing to say, so leave it alone.
  if (ab != null) globalThis.__TEX_AB = ab;
  try {
    const payload = bake(name, texSize, quality);
    self.postMessage({ id, ok: true, payload }, bakeTransfers(payload));
  } catch (err) {
    // Never leave the host waiting on a job that threw — it schedules by completion.
    self.postMessage({ id, ok: false, name, error: String(err?.message || err) });
  }
};

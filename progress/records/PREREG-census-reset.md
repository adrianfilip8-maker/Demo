# PREREG — census reset: the cache's 12.5% refresh bill, and the re-run that becomes possible

**Status: SEALED, NOT APPLIED.** Hard constraint (task #23): no `src` edit until Capture B
lands. Capture A (`shots/cap7`) is rendering, Capture B follows; the pupil metric is a
difference that is clean only if the two frames differ by exactly the pupil keys. Nothing in
this file touches the tree until the coordinator green-lights. No captures scheduled here.

**Starting state, pinned.** `HEAD = 2520a76`, `src/render/Lighting.js` clean in the working
tree. The geometry fingerprint terms are **absent** (grep for `geometry.id * 31` / `drawRange`
returns 0) — `58b66c1` was reverted and the revert committed. The `%8` census reset is
**present** at `_censusCasters()`'s last line. Both facts are preconditions of everything
below; if either is false when this runs, stop and re-seal.

---

## 1. The defect

`_updateShadowCache()` runs the caster census on a fixed cadence:

    if (!this._staticCasters || (this._cachePoll++ & 7) === 0) this._censusCasters();

and `_censusCasters()` ends with:

    this._staticSig = NaN;    // set membership changed ⇒ next compare refreshes

`NaN` never compares equal, so `dirty` is true on the next line for **every 8th frame
regardless of whether the set changed**, and every cached cascade takes a full static
refresh. Measured by the V3 null control: 26 refreshes over 100 dt-0 frames on a static
camera with a quiescent world (12–13 censuses × 2 cached cascades, + 2 owed by the restore).
This arrived with the original cache commit `002f27e`, seven hours before the fingerprint fix
that the control was written to test — confirmed by reading `58b66c1^`.

It is a live steady-state cost in the shipping build, not a latent hazard.

## 2. The fix, and why it cannot mask a membership change

Replace the unconditional reset with a conditional one, keyed on a **membership hash** built
by the census over the exact set it just assembled:

    // in _censusCasters(), replacing `this._staticSig = NaN`
    let h = 0x9e37 | 0;
    for (let k = 0; k < statics.length; k++) {
      const o = statics[k];
      h = (Math.imul(h, 31) + o.id) | 0;
      h = (Math.imul(h, 31) + ((o.material?.shadowSide ?? o.material?.side ?? 0) | 0)) | 0;
    }
    h = (Math.imul(h, 31) + statics.length) | 0;
    if (h !== this._memberSig) { this._memberSig = h; this._staticSig = NaN; }

`o.id` is three's monotonic per-object counter, unique and never reused within a session. The
hash is order-sensitive (polynomial, `Math.imul`), so an add, a removal, a substitution, a
side-class change or a reparent that reorders traversal all change `h`. `_memberSig`
initialises to `undefined`, so the first census after boot or after `_disposeShadowCache()`
resets as before. Allocation: none. Cost: two `imul`s per member on a `%8` beat.

**Why this cannot mask a genuine membership change — the argument, in the order the safety
actually holds:**

1. **The reset was never the detector.** The per-frame fingerprint loop iterates over
   `this._staticCasters` itself. A member that appeared contributes its transform terms plus
   the `+11` visibility term to `sig`; a member that vanished stops contributing. So a
   membership change already moves `sig` on the very next frame, at zero cost, and forces the
   refresh through the ordinary `dirty` path. The unconditional `NaN` was redundant with a
   detector that was already load-bearing — which is exactly why removing it costs no
   detection and saves 12.5% of frames.
2. **The membership hash closes the one gap in (1).** A float sum can in principle collide —
   remove two members, add two others, land on the same total. `h` is a different function of
   a different input (identities and order, not transforms), so a masked change must defeat
   **both** simultaneously.
3. **Removal is caught immediately and independently.** `if (!m.parent) { sig = NaN; break; }`
   already fires on the first frame after a mesh leaves the graph, before either of the above.

**Known latency, recorded not fixed, and pre-existing.** A *newly added* caster is invisible
to both detectors until the next census, so it casts no cached shadow for ≤8 frames. This is
unchanged by the fix — under the current code the new mesh is equally absent from
`_staticCasters` until the census — so the fix neither introduces nor removes it. V4 below is
run with ≥10 frames after the mutation precisely so it certifies the steady state and not the
latency window.

## 3. Why V3's `= 2` band was unreachable, and what that means about the FAIL

V3 runs 100 dt-0 frames and scores the refresh-counter delta. With the reset standing, the
arithmetic floor is 12 censuses × 2 cached cascades + 2 restore = **26**. Every value the
instrument could emit therefore landed in `≥ 9` = FAIL, for **any** fingerprint
implementation — correct, incorrect, or absent.

So the old band was **not mis-drawn; it was untestable.** It partitioned the outcome line
correctly (0–1 FAIL · =2 PASS · 3–8 MARGINAL · ≥9/NaN FAIL — every non-negative integer and
NaN in exactly one band), and the FAIL verdict was correctly returned and correctly executed.
What it could not do was *discriminate*: a control whose pass region is arithmetically
unreachable carries no information about the thing it is controlling. That is the precise
sense in which the diagnosis exonerated the geometry terms while the verdict still stood —
and why the remedy was reversion rather than argument. *"The failing control doesn't
implicate my change" is exactly the argument that manufactures a pass.*

After the fix, the floor becomes 2 (the restore's own refresh, one per cached cascade), so
`= 2` is reachable and the control becomes discriminating for the first time.

## 4. What runs, once green-lit

**Apply order** (both are `src` edits, both gated on Capture B):
1. The census fix above.
2. Re-apply `58b66c1`'s Lighting.js hunks — the geometry fingerprint terms
   (`geometry.id*31`, `index.version*37`, `position.version*41`, `drawRange.start*43`,
   `drawRangeCount*47`, `Infinity → −1`), unchanged, and re-amend the trigger-4 doc line.

**Then re-run V1–V3 exactly as sealed in `PREREG-fingerprint-geometry.md`. Bands verbatim,
not re-drawn.** V1 and V2 passed their correctness legs at 0 px with both non-vacuity legs
probative (105,748 px and 12,406 px); those results are carried forward as context and are
not re-litigated. The re-run either lets them back in on the same bands or does not.

    V1/V2 stake      diff(cached, legacy):        = 0 PASS · ≥ 1 FAIL
    V1/V2 non-vacuity diff(after, before):        ≥ 200 probative · 1–199 WEAK · = 0 VOID
    V3 null control  refresh delta / 100 frames:  = 2 PASS · 3–8 MARGINAL · ≥ 9 or NaN FAIL · 0–1 FAIL

**V4 — new leg, sealed now, testing the census fix's own risk.** V1–V3 mutate geometry and
quiescence; none of them adds or removes a caster, so none tests the property §2 argues for.
An argument is not a test.

  V4a (add): after V3's restore, construct a `THREE.Mesh` (BoxGeometry 3 m, castShadow,
    opaque) and add it to the scene inside the hero frustum and inside c1's slice, sited so
    its shadow falls on lit paving; 10 dt-0 frames (≥1 census); capture cached and legacy.
  V4b (remove): `parent.remove()` the same mesh; 10 dt-0 frames; capture cached and legacy.

    V4a/V4b stake       diff(cached, legacy):     = 0 PASS · ≥ 1 FAIL (membership masked)
    V4a/V4b non-vacuity diff(after, before):      ≥ 200 probative · 1–199 WEAK · = 0 VOID
    V4 refresh delta across each mutation:        ≥ 2 PASS (both cascades refreshed)
                                                  1 MARGINAL (one cascade only — investigate)
                                                  = 0 FAIL (membership change not detected)

Bands partition their outcome lines: pixel diffs are non-negative integers, refresh deltas are
non-negative integers, every value lands in exactly one band. No adjective in this seal carries
a verdict (§26.2). Baselines to pin at run time, before any leg: the V1 target mesh's name and
triangle count, the refresh counter immediately before V3's window and before each V4
mutation, `probe.cache.engaged` on every cached job (a tripped valve voids the run), and the
tracked static count.

## 5. The re-derived saving figure — the deliverable that closes §19's strikethrough

**Quote nothing until this is measured.** Every previously published figure — the 33–41% and
the corrected statics-only 34.7–40.1% — assumed a refresh rate near zero on a static camera,
which the null control falsified. Both are struck at their declaration site (`KNOWN_ISSUES.md`
lines ~1437–1443) and neither is to be re-used, including as a bound or a "roughly".

Derivation to publish, corrected column only, statics only:

    r      = measured refresh rate = refreshes / (N frames × C cached cascades), from V3's
             100-frame window with the restore's own refreshes subtracted
    S      = static triangles the cached cascades would redraw per frame under legacy,
             summed over cached cascades, visible tracked statics only
    saving = (1 − r) × S        (a refresh frame pays S in full; other frames pay 0)
    quote  = saving / D, with D stated explicitly beside it

`D` must be named in the same sentence as the percentage — the struck figures' denominator was
never restated, which is half of why they travelled unchallenged. `S` and the dynamics redraw
are both invisible to `engine.stats` (`Engine.renderFrame` resets `info` *after* module
`update()`s, and all cache work happens inside `Lighting.update()`), so `S` comes from the
module counters and the headless census, never from a counted-column delta. The counted column
is not quoted, not as a cross-check and not in parentheses.

Expected shape, stated as a prediction so it can be wrong: with r → ~0 the corrected figure
should land near the previously published statics-only band. **If it does, that is not
vindication of the struck numbers** — they were unquotable because their input was unmeasured,
and an unmeasured input landing near the truth is luck, not evidence.

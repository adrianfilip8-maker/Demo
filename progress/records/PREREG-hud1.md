# PREREG-hud1 — the guard→HUD seam, registered before the candidate exists

Written and committed BEFORE any change to `src/ui/*`. §141.1: a criterion derived after seeing
the candidate voids the run. Every threshold below is fixed here; if one turns out to be wrong,
the run is VOID and gets re-registered, never quietly re-derived.

## What is being measured

`src/ai/Guard.js:647` emits `guardAlert` **only from `Patrol._setState()`** — that is, on state
*transitions*, never continuously. `src/ui/HUD.js:_onGuardAlert` consumes it as though it were a
level-triggered heartbeat. Three consequences are claimed as defects. Each gets an instrument and
each instrument gets a positive calibration arm that MUST fire against the CURRENT code.

## Registered thresholds

### M1 — every alert state is distinctly presented
The five *live* states (`patrol`, `suspicious`, `searching`, `chase`, `lost`) plus the two
incapacitated ones (`stunned`, `ko`) each map to a presentation tuple
`(glyph, colour, ring fraction, label)`.

- **Threshold**: for every unordered pair drawn from the five live states, the tuples must differ
  in **at least 2 of the 4 channels**, and no two may share the same `(glyph, colour)` pair.
- **Rationale, fixed now**: a one-channel difference is exactly the present failure — ring fill
  alone is a continuous cue that reads as "the same badge, slightly different". Two channels is
  the smallest margin that survives a glance, which is the stated design requirement.
- **CALIBRATION ARM (must fire)**: the identical assertion run against the CURRENT mapping must
  FAIL and must name a specific colliding pair. If the calibration arm passes, the instrument is
  blind — interrogate it, do not adjust it.

### M2 — contrast is a real number
Every foreground colour the HUD paints on a backing it also controls is measured as a WCAG 2.1
contrast ratio against that backing.

- **Threshold**: **≥ 4.5:1** for body-size text; **≥ 3.0:1** for large text (≥ ~24 px equivalent)
  and for icon/glyph strokes carrying meaning.
- **CALIBRATION ARM (must fire)**: a known-bad pair (`--gold` on `--gold-l`) must compute **< 4.5**
  and be reported by the same function that clears the real pairs; a known-good pair
  (`--paint` on `--ink`) must compute **≥ 4.5**. Both arms must fire or the ratio code is not
  trusted.
- Ratios are computed from the sRGB relative-luminance formula, not eyeballed.

### M3 — a live alert survives an edge-triggered source
Feed exactly ONE `guardAlert` for a live state, then advance time with no further events.

- **Threshold**: the marker must still be presented at **T = 30 s**.
- **Rationale, fixed now**: `DETECT.searchTime` is 9.0 s and `DETECT.lostLook` 3.6 s, so a real
  SEARCHING episode outlives the present `alertTTL` of 2.2 s by roughly 4×. 30 s is a deliberate
  margin proving the marker is driven by the last known STATE and not by a decay timer.
- Only an explicit transition to `patrol`, or a `null` payload, may retire a marker.
- **CALIBRATION ARM (must fire)**: the same sequence against the CURRENT code must show the marker
  GONE at 30 s.

### M4 — position tracks the guard
`_alertPayload.pos` is a live `THREE.Vector3` (`Guard.js:421` assigns it once, before the payload
is built at :451), so a consumer that keeps the reference sees every subsequent move.

- **Threshold**: mutating the guard's position vector in place by 5 m and running one update must
  move the projected marker by **> 1 px**.
- **CALIBRATION ARM (must fire)**: the same mutation against the CURRENT code must move it by
  **exactly 0 px**, because the current code snapshots into `a.pos` only inside `_onGuardAlert`.

### M5 — §211.1, nothing passes having inspected nothing
Every data-driven assertion here (the pair sweep in M1, the colour sweep in M2) asserts a
**non-zero inspected count** and pins that count to an exact expected number, so a mapping that
silently loses rows fails instead of passing vacuously.

## Out of scope for this run
- No edits to `src/ai/*`. The fix must ride on `guardAlert` as it is already emitted.
- No capture lock. The HUD is a DOM overlay and `__GAME.capture()` is a WebGL canvas readback
  (`src/core/Debug.js:192`), so no HUD change can alter a frame. That claim is itself checked
  below rather than assumed.

# RESULT — scoping the §269 shade band by camera sky-exposure

Seal: `progress/records/PREREG-holdscope.md`, committed at `ca98138` **before** the mechanism was
written and before any candidate frame existed. Mechanism: `3d166d1`. Harness `tools/holdscope.mjs`,
scorer `tools/holdscopescore.mjs` on `gate.mjs` (fail-closed), offline cross-instrument
`tools/fanpredict.mjs`. Frames: `shots/holdscope/` (working output, gitignored). Log:
`progress/records/logs/holdscope.log`.

*(results below)*

## 0. What was asked and what this answers

§269 built a shade band derived per pixel from a material's own albedo, measured it fixing critic
9's ranked D1 on daylight, and shipped it **inert** because `interior` refuses it — structurally,
not marginally: a tomb is at `shadowMix` 1 everywhere, so the band is its lighting rather than a
shadow on top of lighting. §271.3 refuted per-material scoping (one shared-by-identity uniform;
8 of 12 architectural materials in the tomb *and* in daylight) and refuted key radiance as the
discriminator (`interior` runs the brightest key in the game). §271.4 named the scope variable:
`Lighting.enclosure`, a five-ray sky fan that had been computed and published with no consumer.

This lane wires it, and tests the fix against a warm/cool guard for the first time.

## 1. Method, and the three hazards it was built around

**One invocation, one boot, one tree.** Every arm is captured inside a single process. The
provenance digest — SHA-256 over all of `src/`, plus `HEAD` and `HEAD:src` — is taken inside the
harness's `onLocked` hook (after the lock is granted, before vite spawns) and again in
`onReleasing`. Taking it at process start, which is where it started, would have compared a tree
from an hour earlier in the FIFO queue and VOIDed on another lane's commit that the frozen bundle
never saw; that is fixed at `6dad3e6`, before the candidate existed. `HEAD` moving is not a VOID —
three other agents commit here while a capture runs — a `src/` digest change is.

**The threshold is fitted to an independent criterion, not to the frames.** `debugTerm(5)` writes
`vec3(ramp, ndl, key)`, so its blue channel is the direct sun arriving at each pixel, shadow map
included. Read through `postfx.debugRaw('scene')`, with `debugTerm(4)`'s calibration constant
required exactly first. A shot is OPEN iff at least 5 % of its pixels are sunlit. The rule that
turns that partition into a number was sealed before the probe ran: T is the midpoint of the gap
between the most-enclosed OPEN shot and the least-enclosed ROOFED shot, or the proxy is REFUTED.

**The instrument is §269's, and it had to prove it.** The hue scorer here is a re-implementation
of the Python one frozen before §269's candidate existed. A re-implementation is a different
instrument until it reproduces the original, so I1 re-scores two frames the original already
scored. Measured before any candidate frame existed, across fourteen statistics on two frames:
worst disagreement **0.0023** (`interior` warm %), eleven of fourteen exactly 0.

## 2. What the fan reads, derived offline while the capture was fourth in the queue

`tools/fanpredict.mjs` casts the same five directions at Architecture + Props triangles instead of
at the collision BVH — a **different instrument on purpose**, so agreement is evidence and
disagreement names a mesh that is drawn but not collidable.

| shot | enclosure | blocked rays |
|---|---|---|
| `interior` | **1.00** | up 6.4 m, +x 7.7, −x 7.7, +z 1.2, −z 7.7 |
| `temple` | **0.80** | up 6.8 m, +x 8.2, −x 8.2, −z 16.3 (+z escapes) |
| `sly-closeup` / `sly-perch` | 0.60 | courtyard masonry 12–15 m off |
| `combat` | 0.40 | up 10.5 m, −x 12.9 |
| `courtyard` / `night` | 0.20 | one ray each |
| `dunes` / `hero` / `traversal` | 0.00 | none |

Two things in that table matter beyond the tomb. **`sly-closeup` and `sly-perch` sit at 0.60 under
open sky** — the 34° cone finds courtyard masonry — so any "roofed" threshold below 0.8 would
misclassify two character shots as tombs. And **`interior` is the only camera in the game at
1.00**, which is one ray of margin.

## 3. Robustness — a threshold that separates ten fixed cameras is not a term that behaves in play

`SANDS_ROBUST=1 node tools/fanpredict.mjs`. Thirteen samples per camera (±1 m on each axis and
each face diagonal), classed at T = 0.9:

| shot | base | min | max | class over the neighbourhood |
|---|---|---|---|---|
| `interior` | 1.00 | 1.00 | 1.00 | **ROOFED, all 13** |
| `temple` | 0.80 | 0.80 | **1.00** | **OPEN + ROOFED** |
| every other camera | — | — | — | one class throughout |

**`temple` is one metre of camera travel from changing which branch it renders.** The shot itself
is stable — the canonical camera reads 0.80 every time — but the game is not a shot, and a player
walking the nave crosses that boundary.

And the fan's own constants:

| shot | 30 m/34° | 15 m/34° | 60 m/34° | 30 m/20° | 30 m/50° |
|---|---|---|---|---|---|
| `interior` | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| `temple` | 0.80 | 0.60 | 0.80 | **1.00** | 0.80 |
| `combat` | 0.40 | 0.40 | 0.40 | **0.80** | 0.60 |

**The tomb's reading is a property of the tomb; the hall's reading is a property of the fan.**
`interior` returns 1.00 at every probe distance and cone angle tried. `temple` returns 0.60, 0.80
or 1.00 depending on constants nobody chose with this decision in mind — they were chosen for a
sky-fill term that was then bracketed and refused.

**What the hysteresis is and is not worth here.** `enclosure` is quantised to fifths by a five-ray
fan, so the *target* jumps 0.8 → 1.0 in one step and a dead band narrower than 0.2 could never
hold a decision against it. The band is not applied to the target: it is applied to the **smoothed**
value, which crosses continuously over ~0.25 s when a camera walks, and is snapped on a cut. So
`holdEncloseHyst = 0.10` does what it was put there for while walking and correctly does nothing
for a camera cut. It does **not** rescue the one-metre `temple` boundary — that is a fan-resolution
problem, not a damping problem.

# PREREG-sparkcount — count the sparkle grammar from `SparkleField` instance data, not from pixels

**Owner:** FX. **Date sealed:** 2026-08-06, before any sparkcount probe exists.
**Parent:** `NOTE-sparkle-predicate.md` (§34 corrections applied at CRITIC-sbs3 §3.8/§3.9). That
note registered a per-shot `skyCut` row mask as the *correct fix for the metric as published*
and flagged the durable fix as upstream. This seal is that upstream fix.
**Registration tree:** `85bab2d30f5f7b59` (`find src -name '*.js' | sort | xargs sha256sum |
sha256sum`, §121.4). `src/fx/Particles.js` verified byte-identical to HEAD at sealing.
**No `src/**` edits.** No git — the coordinator sweeps; §8 lists every file.

---

## 0. A units finding that changes the dispatched calibration, stated before anything else

The dispatch asks that the instance count "reproduce the geometric predicate's numbers …
traversal 236, night 50, preroll-off 0". **236 and 50 are pixel counts; an instance count
yields markers.** These are different units and no correct instrument can make one equal the
other — a single marker paints 82 px on traversal and 1 px elsewhere. Forcing numeric agreement
would mean tuning a marker count until it read 236, which is the §141.1 defect built on purpose.

**The correspondence that IS meaningful, and what this seal registers instead:**

| pixel path | instance path | committed value |
|---|---|---|
| connected **blobs** of strict-band px | **markers** counted visible | traversal `b2-cand` **14 blobs** |
| blobs after the `skyCut` mask | markers | `sbs2/night` **16 blobs** / 50 px |
| strict px on the known-bad | markers | `b2-base` **0 blobs / 0 px** |

**`0 ↔ 0` on the known-bad is a genuine numeric agreement and is registered as such.** The other
two are registered as **blob↔marker** correspondences. This is a correction to the dispatch's
calibration, not a weakening of it: it is the difference between calibrating and curve-fitting.

## 1. The mechanism, and why a naive instance count is a guard that cannot fail

`SparkleField` (`src/fx/Particles.js:1575-1700`) holds, per marker:
`aPos` (x,y,z, `:1589`), `aData` = `[phaseSeed, scale, born, —]` (`:1590`), `count` /
`geometry.instanceCount` (`:1579`, `:1682`).

Visibility is **not** in `count`. `SPARKLE_VERT` (`:728`) gates every marker on
`pop = smoothstep(0.0, 0.22, uTime − born)`, and PREREG-fxcluster §0.2 established that
`Debug.setShot` re-bases the FX clock twice, leaving `uTime − born ≈ 0.033` at a canonical
capture → **`pop ≈ 0.02–0.09`**. That is the whole b2 defect: `sbs1/sly-closeup`'s in-page probe
recorded **`sparkles latched=17 fresh=17`** on a staging whose strict pixel count is **0**.

**Therefore a raw `fx.sparkles.count` would have read 17 on the very frames the pixel metric
correctly scored 0, and would have certified the sparkle grammar as served through rounds 1 and
2 when it was invisible.** That is §177 finding 2 in a third dress — a guard that cannot fail.
**This seal registers a visibility-qualified count and forbids the raw one.**

## 2. The registered quantity

```
SPARKCOUNT(shot) = #{ markers i : popOf(i) >= POP_MIN  AND  inFrustum(i)  AND  scaleOf(i) > 0 }

popOf(i)     = smoothstep(0, 0.22, uTime_fx − aData[4i+2])     // SPARKLE_VERT:728, ported
inFrustum(i) = project(aPos[i]) lands in [0,W)x[0,H)  AND  is in front of the camera
POP_MIN      = 0.5                                              // half-open; registered, not tuned
```

Reported **beside** it, never in place of it (each is a diagnosis when they disagree):
`rawCount` (= `fx.sparkles.count`), `popOpen` (pop ≥ 0.5, no frustum test), `inFrustumOnly`,
`uTime_fx`, `fx._t0`, and the full `aPos`/`aData` dump so any successor can re-derive without a
new boot.

## 3. What each path can see that the other cannot — all four cases, and which side each lands on

| case | pixel path | instance path | which is right |
|---|---|---|---|
| **Sky haze inside the colour tolerance** (the defect this replaces) | **counts it** — 174 false px on `sbs3/night` | **cannot see it**: haze is not a marker | **instance**. This is the whole reason for the change. |
| **Marker occluded by geometry** | 0 px — `depthTest: true` (`:1611`) means it is depth-rejected | counts it (position is in frustum) | **pixel**. `SPARKCOUNT` **over-counts here and cannot fix it**: occlusion needs a depth query the CPU path does not have. **Declared as a known over-count, not repaired.** |
| **Marker off-frame** | 0 px | 0 — the registered `inFrustum(i)` test rejects it (`mesh.frustumCulled = false`, `:1620`, so without this test it would over-count) | **agree**, because the seal ports the frustum test. |
| **Marker whose sprite never reaches the colour band** (b2: the emitted core ports to R above the band's 183 ceiling, so only the annulus can satisfy it) | 0 px — *undercounts a marker that is genuinely drawn* | counts it | **instance**. The pixel path's known blind spot; CRITIC's own §3.9 note that "markers sit at the edge of the canonical tolerance" is this case. |

**Net:** the instance path fixes two of the pixel path's errors (haze false-positives, sub-threshold
true-positives), matches it on off-frame, and introduces exactly one of its own (occlusion),
which is **declared here rather than discovered later**. Occlusion is why `skyCut` is *retired,
not deleted* — §6.

## 4. §13 known-bad and calibration

| control | prediction | why it fails as its own failure |
|---|---|---|
| **KB1 — `traversal`, preroll OFF** | `SPARKCOUNT = 0` while `rawCount ≈ 14–17` | The whole point. If `SPARKCOUNT` returns the raw count here, the visibility gate is not wired and the instrument is void. |
| **KB2 — `traversal`, preroll ON** | `SPARKCOUNT = 14 ± 3`, matching the 14 committed blobs | If it returns 0 the pop port is inverted; if it returns capacity the frustum test is dead. |
| **KB3 — `night`** | `SPARKCOUNT` = 16 ± 4 (the 16 committed blobs at `skyCut`), and **not** ≈ 62 (the uncut blob count) | A count near 62 means the instrument has re-acquired the sky population by another route. |
| **KB4 — a shot with no sparkle affordances in frame** (`interior`) | `SPARKCOUNT = 0` | An instrument that reports markers where the level places none is measuring its own capacity. |

**The calibration licenses nothing until KB1 and KB2 both hold.** KB1 is the one that matters:
it is the only control that separates this instrument from the raw count that would have passed
rounds 1–2.

## 5. Falsifiers — revert, do not defend

- **P-S1** — KB1 returns non-zero → the visibility gate does not work → **`skyCut` stays the
  registered predicate**, this seal is withdrawn, and the probe dump is the finding.
- **P-S2** — KB2 outside 14 ± 3 → marker↔blob correspondence is refuted → report the disagreement
  **as the finding** (dispatch's explicit instruction), do not tune `POP_MIN` to close it.
- **P-S3** — KB3 lands near the uncut 62 → the sky population re-entered → withdraw.
- **P-S4** — KB4 non-zero → the instrument counts its own buffer → withdraw.
- **P-S5** — `fx.sparkles` absent or `aData` unreadable in the boot → **FATAL before any claim**;
  record and stop (the b2 runner's own `preroll`-absent abort, same shape).
- **No mid-run redesign** (§141). `POP_MIN = 0.5` is registered here and is not a tuning knob.

## 6. What replaces what, and what is kept

On KB1+KB2 holding, `SPARKCOUNT` becomes the registered §2.1-item-6 grammar count and the
per-shot `skyCut` row mask is **retired as the primary**. `skyCut` is **kept as a published
cross-check**, not deleted, for two reasons: it is the only instrument that sees *drawn pixels*,
so it is the only one that can catch the declared occlusion over-count in §3; and a disagreement
between the two is itself diagnostic. **Any letter quoting one must quote both.**

## 7. Capture plan — probe-only, no frames, and it must queue

**A capture IS required**: no committed readback carries sparkle instance data (checked —
`b2-readback.json` and `readback-2.json` contain only the `sparklePreroll` flag). But **no frames
are captured**: the runner boots, stages four shots, reads `fx.sparkles` and writes JSON. No
PNG, no scoring of pixels, so it is a short hold.

Runner `fxcluster1/sparkcount.mjs`: seam-verify (`SparkleField`, `preroll`) with no-edit abort →
FIFO lock via `withGame` (**litwarm is running with staging1 and combatrecipient queued — ticket
and wait; do not jump**) → for each of `traversal` (preroll off), `traversal` (preroll on),
`night`, `interior`: `setShot`, `step(10, 0)`, dump `count`, `aPos`, `aData`, `uTime`, `_t0`,
camera, and compute `SPARKCOUNT` **offline afterwards** from the dump, so the registered
arithmetic is auditable and re-derivable without a second boot.
Scorer `fxcluster1/sparkcount-score.mjs`: thresholds transcribed from §4.

## 8. Files of record

`progress/records/PREREG-sparkcount.md` (this seal); `fxcluster1/sparkcount.mjs`,
`sparkcount-score.mjs`, `sparkcount-readback.json`, `sparkcount-scores.json`,
`logs/sparkcount-r1.log`; verdict appended to `RESULT-fxcluster.md`.
Prior evidence relied on, all committed: `NOTE-sparkle-predicate.md`, `fxcluster1/sparkdiag.json`
(the 14/16/62 blob counts and the 236/50/0 pixel counts), `fxcluster1/b2-readback.json`.

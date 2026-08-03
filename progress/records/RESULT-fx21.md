# RESULT — fx21, scored against PREREG-sandhigh.md as registered

Frames: `shots/fx21/` (19 files). Log `progress/records/logs/fx21.log`, boot stamp
`progress/records/fx21.treehash.json`. Scored with `scratchpad/fx21an.mjs` (ordering as
registered) plus `scratchpad/fx21power.mjs` (falsifier-power check, written after the frames
existed and reported as such).

## 0. Provenance — the change fell AFTER `page.goto`, so the run is clean

My own BEFORE/AFTER check flagged `b8e9b87cdb57ed2f → ff5a874ccd1931c7`. Adjudicated rather
than inferred:

    page.goto (boot tree)     2026-08-03T17:40:42.313Z   head a190e81, CLEAN
    src/world/EgyptLevel.js   mtime 18:01:32   commits 17:59:19 / 18:02:50 / 18:12:01
    src/world/Props.js        mtime 18:02:18            (all AFTER goto)

Every edit that moved the hash landed **after** the bundler read the tree. Per §124.4 that is
harmless: the harness navigates once, no reload. `driftFromQueued: []` agrees for the watched
set, and `EgyptLevel.js` is *in* that set, so it is covered directly rather than by the general
rule. **All 19 frames are on one boot tree (a190e81, clean).**

Consequence for the interior anchor, stated because it is why `temple` was re-captured: `temple`
here is in the **same boot** as the three exteriors, so the cross-shot comparison this run needs
is internally consistent. Comparison to `fx20`'s `temple` remains cross-tree (fx20 booted
`bb164fb` dirty) — which is exactly the exposure the re-capture removes.

## 1. Controls — all four pass, nothing is void

`back == base` at **0 px** on `dunes`, `hero`, `courtyard`, `temple`. No row is void.

## 2. THE FALSIFIER: it did not fire — and it **could not have fired**. UNTESTABLE, not PASS.

Registered: *fires if an exterior carries a ΔL ≥ 8 component over a backdrop of luma < 60 and
R/B < 0.5.* No exterior component reached ΔL 8 (maxima: `hero` +4.12, `dunes` +3.20,
`courtyard` −3.18). Reported naively that reads as "the ARTEFACT/FIELD split is confirmed".

**It is not, and §144.1 is the reason.** The precondition was never present to be tested:

| shot | components ≥40px | backdrop luma<60 | R/B<0.5 | **BOTH** |
|---|---|---|---|---|
| dunes | 42 | 0 | 1 | **0** |
| hero | 32 | 8 | 0 | **0** |
| courtyard | 59 | 1 | 0 | **0** |
| temple | 25 | 5 | 2 | **2** (disc +17.28, blob6 +1.63) |

**0 of 133 exterior components met the backdrop precondition.** The falsifier's silence carries
essentially no information about how `sandHigh` behaves outdoors; it records that daylight
exteriors contain no dark-blue surface class. That is *consistent with* the registered mechanism
— a field engineered to vanish against sand only acquires contrast on the one large surface that
is neither sand-coloured nor sand-lit — but it is **not an independent test of it**, and I am not
banking it as one. Verdict: **UNTESTABLE in this framing.**

The ARTEFACT half of the split therefore rests, still, on a single component in a single shot.

## 3. Arm A — the field-cost baseline (valid, testable, and the part that did land)

Means are over the **changed population**, not the frame (§135.1: `absSum / changed`), and the
changed fraction is quoted beside every one so the ceiling cannot read tighter than it is.

| shot | changed px | % of frame | mean\|ΔL\| | scattered (<200px) | total \|ΔL\| budget | ±15% band |
|---|---|---|---|---|---|---|
| dunes | 14046 | 1.52% | 2.05 | 21.9% | 28725 | 24416 – 33034 |
| hero | 13788 | 1.50% | 2.03 | 13.6% | 27958 | 23764 – 32151 |
| courtyard | 14799 | 1.61% | 2.12 | 26.5% | 31323 | 26624 – 36021 |
| temple (anchor) | 13694 | 1.49% | 5.81 | 7.6% | — | — |

All three registered predictions scored **YES** on all three exteriors: larger total than
`temple`, higher scattered fraction, and no ΔL≈+17 component. The `temple` disc reproduces at
**+17.28 over backdrop luma 44.4 / R/B 0.13** — same value as the offline `fx20` measurement, in
a different boot on a different tree.

Threshold caveat that travels with the budget: `changed` counts pixels with summed channel
delta ≥ 4, so `total |ΔL|` is a **floor** on the true contribution and is threshold-sensitive
rather than linear — a fix that uniformly thins the field pushes pixels *under* the threshold and
the budget will over-report the loss. That direction is safe (it fails a thinning fix early),
but it should not be read as a linear measure of field density.

## 4. What this does to Arm B, before any fix is chosen

Arm B stays scoreable: the disc test is on `temple` (testable), the field ceiling is on the
exteriors (testable, numbers above). But §2 has a consequence for **fix selection** that was not
visible before this run:

> **The exterior ceiling has almost no power to discriminate a backdrop-conditioned fix.**
> Candidate 1 (backdrop-conditioned suppression) acts only where the backdrop is dark and blue —
> a class that occurs in **0 of 133** exterior components. Such a fix is inert outdoors *by
> construction*, so it passes the exterior ±15% ceiling trivially, without that pass being
> evidence of anything.

So the exterior ceiling constrains the *global* candidates — 3 (vertical box / `yOffset`) and any
screen-size or alpha thinning — and is nearly vacuous against candidate 1. Anyone reading a
future "Arm B PASS" needs to know which kind of fix it was scoring. Candidate 2 (enclosure gate)
sits in between: it keys on roofed-ness, which is also interior-only, so it inherits the same
weak exterior test.

## 5. Instrument audit against the three cautions

- **§144.4 (unbounded estimator):** no autocorrelation anywhere in the scoring path. The only
  normalisation is `100 * changed / N` (a bounded percentage) and `absSum / changed` (a mean over
  its own population). No `v0 * k / N`, no NCC, nothing that can leave [−1,1] because nothing in
  this path is a correlation coefficient.
- **§135.1 (ROI larger than subject):** every mean is over the changed population or over a
  component's own pixels — never over a fixed ROI larger than the subject. Changed-fraction is
  quoted beside each mean, as asked. The disc's +17.28 is a component mean, not diluted.
- **§144.1 (untestable ≠ pass):** applied to my own falsifier and it changed the verdict — see §2.

## 6. Nothing shipped

No fix implemented; Arm A now exists, which was the precondition. `git` untouched.

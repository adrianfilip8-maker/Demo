# PREREG — the `sly-profile` puff fix (§78.2 / §89.3), sealed before any value is chosen

**Nothing is shipped by this run.** The ceiling is applied by *uniform poke* (`uMaxSize` already
exists per batch and is simply `0` for the sand fields), so this brackets a value before any code
change rather than shipping tuning and measuring it afterwards.

## What is already settled, and is NOT re-derived here

- **The object is `sandLow`** (`sand_drift`). §89.3: `no-sandLow` removes a **compact central mass**,
  peak (666,412), 17,807 px. `no-airMotes` and `no-dust` are **exactly zero**.
- **`shimmer` moves 4× the pixels and is not the object** — a diffuse wash across sky and left edge.
  Total pixels moved is the wrong statistic for "which emitter is that object" (§89.3).
- **The mechanism is stacking, not per-sprite alpha** (§78.2): sprites to 1.5 m at α 0.18–0.38,
  exempt from the screen-size ceiling; ten at α 0.3 composite to 0.97 — opaque — and each sprite
  boundary steps the stack by one, so *the countable discs and the hard vertical seam are the same
  artefact*.
- **Soft fade is not the lever.** §78.1's mechanism survived §89.4: `softoff` *darkens* (24,593 px
  down vs 441 up), because removing the fade makes sprites **more** opaque where they meet geometry.
- **Rotation jitter is already implemented** — `PARTICLE_VERT` rotates by `aSize.w * age + seed *
  6.2831`. That draft item is struck: it exists.

## The counter-risk, stated as loudly as the fix

The `maxSize` exemption's own justification is that these are *"low alpha-blended sheets… a sheet
that has to cover the ground is supposed to be large in frame. Clamping those would delete the two
fields that carry the ground haze."* **That justification is wrong as an argument about the puff
(it is per-sprite, the defect is stacking) and right as a warning about the fix.** Applying
`air_motes`' 0.028 ceiling to sand would be ~20 px at 720 and would delete the sheet.

So this is scored two-sided, and **a puff win bought by deleting the ground haze is reported as a
failure, not a partial success** — the same shape as the grounding seal's acne band.

## A bracket, not a point

Three ceiling values, because one guess would only tell me about that guess:

    cap085   uMaxSize 0.085   (~61 px @720)
    cap055   uMaxSize 0.055   (~40 px @720)
    cap120   uMaxSize 0.120   (~86 px @720)   — deliberately weak; if this passes Band 1 the
                                                 defect is milder than §78.2's arithmetic implies

Applied to `sandLow` **and** `sandHigh` (same family, same exemption); `shimmer` is left alone —
it is not the object, and clamping it would be a change nobody has evidence for.

## Regions — derived in-run from this run's own frames, not inherited

§73.2's rule (an ROI must assert a property it can check) and §63.2's (a fixed pixel is not a
landmark when the world moves under it) both apply: `fx18`'s frames are **gone**, so no coordinate
from it is reusable. This run therefore carries its own attribution arm and derives both regions
from the frames it captures:

- **P (puff)** = the largest connected component of `|base − no-sandLow|`. Sanity-asserted: its
  centroid must lie within 150 px of (666,412) and its area must be ≥ 3,000 px. **If that assertion
  fails the puff is not where §89.3 found it and NO band is scored** — reported as a relocation,
  not measured around.
- **G (ground haze)** = `sandLow`-attributed pixels *outside* P (`|base − no-sandLow| ≥ 4`, minus P).
  Asserted non-empty (≥ 2,000 px), else the haze band is unscoreable and says so.

`no-sandLow` is the **reference for total removal**: it is what "the emitter is gone" looks like.

## Band 1 — PUFF (primary)

    removal(cap) = mean|cap − base| over P     as a fraction of     mean|no-sandLow − base| over P

- **PASS** ≥ 0.60 — the ceiling achieves at least 60% of what deleting the emitter achieves.
- **WEAK** 0.30–0.60 — reported, not shipped.
- **FAIL** < 0.30.

## Band 2 — GROUND HAZE (binding counter-risk)

    retention(cap) = mean|cap − no-sandLow| over G   /   mean|base − no-sandLow| over G

- **PASS** ≥ 0.60 — at least 60% of the ground-haze signal survives the ceiling.
- **FAIL** < 0.60 — the ceiling is deleting the sheet the exemption exists to protect. **A Band 1
  pass alongside a Band 2 fail is NOT banked.**

**Ship rule, fixed now:** ship the *largest* (weakest) ceiling that passes both bands — never the
one with the best Band 1 score, because that is the one most likely to be eating the sheet.

## Harness correctness — the leak §89.2 caught is fixed in this script

`fx18`'s `back` arm was bit-identical to `softoff`, not `base`: the softness poke was never
reverted, so the control was a duplicate. **Restore-first here reverts every uniform this script
can touch** (`uMaxSize` back to its per-batch original, captured once at boot; `uSoftness` back to
its original), and `back` is registered to reproduce `base` bit-identically. If it does not, the
run's arms are reported as unattested, exactly as §89.2 had to.

## Also in this boot, at one extra staging

`temple` — to supply the frame §84.4 needs for the **pink disc at (615,160)**, which is confirmed
*not* a depth-state bug and needs naming. Per-batch live counts are probed there, so the candidate
set narrows even if the crop is ambiguous.

`tools/keeplog.sh fx19` is run **when the capture lands and before it is scored** (§90.9/§91).

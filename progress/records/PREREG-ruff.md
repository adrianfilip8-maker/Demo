# PREREG — the two ruff rows §96.4 left standing: attribution hold-out

Written **before** the capture exists. Scoring fixed here so the run cannot be scored to taste.
Owner: CHARACTER. Files: `src/player/SlyModel.js` only.

## What is being tested, and what is NOT

§96.4 records two rows deliberately untouched when the jaw row was fixed:

- **neck ruff**, `SlyModel.js:2792` — `th = side * (0.95 + i*0.55 + jitter)`, `cnt(3)` = 2 cards
  per side, so the inner card sits at θ ≈ 0.95, on the front of the collar.
- **chest ruff**, `SlyModel.js:2765` — two rows, `sp` 0.50 and 0.64, i.e. θ ∈ [−0.64, 0.64],
  entirely across the FRONT of the chest.

The claim to test is **attribution, not shipping**: are the large dark masses flanking the chin
and collar in `char13/sly-closeup.png` *these cards wrapped in ink hull* (§37's mechanism — a
card ~0.015–0.018 wide inside a ~2.5 px hull is mostly hull), or are they cast shadow under the
jaw / the collar material / the mask?

**No offline probe in this repo renders the ink hull**, which is why this needs a frame and why
the delivered-pixel census below cannot answer it on its own. This run is a diagnostic. A
hold-out build is never a shipping candidate.

## Baseline, measured on delivered pixels (already taken, char12 → char13)

`tools/`-free census over fixed ROIs of `sly-closeup` at 1280×720, dark fraction at luma < 60
and mean luma. char12 = `52d4a43`, char13 = `f47e0e4`+dirty.

| ROI | char12 dark | char13 dark | mean luma 12 → 13 |
|---|---|---|---|
| jaw (the row that WAS fixed) | 54.8% | 38.3% | 59.0 → **79.9** |
| neck L (ruff θ0.95) | 64.5% | 61.9% | 54.0 → 54.8 |
| neck R (ruff θ0.95) | 53.7% | 53.7% | 55.5 → 57.1 |
| chest (chest ruff) | 23.7% | 22.8% | 100.5 → 101.9 |
| CONTROL cheek fur | 59.8% | 59.8% | 86.4 → **86.4** |
| CONTROL chest V | 54.7% | 54.7% | 65.0 → **65.0** |

Both controls are **bit-identical across the two builds**, so TEXTURES' `Materials.js` drift does
not reach these pixels and the jaw delta is attributable to the tuft row. That control is
re-used below.

## Arms

One boot each, same commit, differing only by an env gate so **no source file changes between
arms and no other agent's capture is affected** (`VITE_CHAR_AB`, mirroring `VITE_TEX_AB` in
`src/textures/Canvas2D.js`; empty = shipped, which is what every other process gets).

- **A — shipped** (`VITE_CHAR_AB` unset). Control.
- **B — `noruff`**: neck ruff row and both chest ruff rows not emitted. Nothing else changes.

## Pre-committed scoring

Primary, on `sly-closeup`, ROIs above:

- **CONFIRMED** (the cards own the dark mass) — mean luma rises **≥ 15 levels** in **at least two
  of** {neck L, neck R, chest}. 15 is chosen as comparable to the jaw row's own +20.9, which is
  the one instance in the record where this mechanism was seen to move a frame.
- **REFUTED** (the cards do not own it; the mass is shadow/material) — all three move **< 5
  levels**. Then the chip hunt moves off the tuft system entirely and these rows are exonerated.
- Anything between 5 and 15 on the best two ROIs is **INCONCLUSIVE** and is reported as such,
  not rounded into either verdict.

Validity gate, checked first and able to void the run:

- Both CONTROL ROIs must stay within **±3 levels**. If they move more, something other than the
  gate changed and no verdict is read from the run.

Secondary, and it decides shipping rather than attribution — **this is looked at, not computed**:

- The collar edge must still read as a **scalloped mass**, not a clean geometric arc, at 5× on
  the same crop. §96.4's reason for leaving these rows is that "a collar ruff exists to scallop
  an interior edge"; if removal deletes the scallop, removal is a net loss *even if the chip
  goes*.

## Decision rule, committed now

- CONFIRMED **and** collar still scallops → ship the removal.
- CONFIRMED **and** collar goes smooth → **do not ship removal.** Prefer widening the cards so
  hull fraction falls (the body rows are 0.015–0.018 wide against the face rows' `0.020 * S`;
  §37's mechanism is a *ratio*, so width is the lever that keeps the scallop and kills the chip).
  That becomes its own prereg.
- REFUTED → revert nothing, and record the rows as exonerated so the next pass does not re-chase
  them.

## Known limits of this instrument

- The ROIs are rectangles. They cannot separate a card from a shadow *within* the rectangle; the
  hold-out is what does that, which is the whole point of running it.
- `sly-closeup` is one of only two frames that can still score character colour and material
  (§96.2). A result here does not generalise to the other nine framings and is not claimed to.

# PREREG — widen the collar cards so the ink-hull fraction falls

Written **before** the capture exists. Arms, ROIs, statistics and thresholds fixed here so the
run cannot be scored to taste. Owner: CHARACTER. Files touched: `src/player/SlyModel.js` only.

Follow-on named by `PREREG-ruff.md`'s own decision rule and by §110: the `noruff` hold-out came
back INCONCLUSIVE on attribution, and its registered secondary independently **blocked** shipping
the removal (with the cards gone the collar goes a clean geometric arc — §7.3's "smooth plastic").
The rule pre-committed the alternative: *prefer widening the cards, because §37's mechanism is a
ratio.*

---

## The mechanism, now measured on BOTH sides rather than asserted

§37 says "a card ~0.015–0.018 wide inside a ~2.5 px hull is mostly hull". Neither side of that
ratio had ever been measured for these two rows.

**The ink side, on delivered pixels.** Over the `noruff` hold-out footprint (the pixels that
changed when the rows were suppressed — 1136 px inside x[560,660] y[225,285]), the SHIPPED frame
reads **47.9 % at L<30**, sampling RGB (17,13,45), (23,15,32), (21,12,31) — §2.2's ink hexes
`#1a1210` / `#161022`. Underneath, the same pixels in `noruff` are 9.0 % ink, mean RGB 107,103,98.
**Roughly half of what these cards deliver is ink**, and that is now a measurement.

**The geometry side.** `scratchpad/ruffsweep.mjs` rasterises all 8 collar cards through the real
`sly-closeup` camera with a depth-aware **per-card** 2.5 px hull. Per-card matters: the shell is
one BackSide duplicate of the whole body mesh, so a card lying on another card carries its own
full border — ink between overlapping cards is *interior*. A model that unions the cards before
dilating predicts the opposite of the truth here.

```
k       1.00   1.25   1.50   1.75   2.00   2.50   3.00
ink     44.3%  40.0%  36.5%  35.4%  35.7%  34.6%  34.3%
interior ink px  182    202    218    265    330    412    524
```

The model's 44.3 % at shipped width sits close to the delivered 47.9 %, which is the one piece of
external agreement it has. **k = 1.75 is the knee**: it takes 8.9 of the ~10 points the lever
contains; k = 3.00 buys 1.1 more for +57 % card area.

**Two things were tested and rejected before settling on width.**

- *Spread.* The cards are stacked — the right-hand neck pair sits at **7.0 px pitch with 17 px
  cards** (duty 2.43). Un-stacking them makes ink share **worse**: 44.3 % → 46.5 % at 1.6×, 51.7 %
  at 2.0×. Width is the lever; spread is not.
- *Hull thickness.* This is the other side of the ratio and it is **not available to CHARACTER**:
  `Outline.js` builds one shell with one `thickness` for the entire body mesh, and `_material()`
  passes `outline: 1.0` for every group. A per-group ink weight would be a SHADING change.

## The bib bound does not bite, and that is why this is safe now

The state this row was cut back FROM (`e19b80c` — *"covered the whole cream chest V in overlapping
slabs … a bib or a folded napkin"*) was `w` 0.020 / 0.024 at `tuftWidth` **1.55** → final
half-width **0.0310**. Today's is 0.015 × **2.50** = **0.0375**. **The shipped cards are already
21 % wider than the bib's.** What made it a bib was count and length: `N = round(5 * D)` at
`tuftDensity` 2.2 is **11 cards per row** against today's 2, and lengths 0.056/0.042 against
0.040/0.030. Row area is ~6.4× under the bib today and ~3.6× under it at k 1.75.

**Widening is not the thing that was falsified.** That is the load-bearing fact for this run, and
it was found by reading the row's own history rather than by trusting the comment's summary.

---

## Arms

One boot each, **same commit**, differing only by an env gate, so no source file changes between
arms and no other agent's capture is affected (`VITE_CHAR_AB`, the same gate `noruff` used).

- **A — shipped** (`VITE_CHAR_AB` unset). Control. This is what every other process gets.
- **B — `widecards`**: `NECK_RUFF_W` 0.015 → 0.02625 and `CHEST_RUFF_W` [0.015, 0.018] →
  [0.02625, 0.0315]. Nothing else changes.

**Attestation that arm B is not a no-op.** The usual triangle delta is unavailable — widening
moves vertices and adds none (14044 tris in both arms), so it is attested on geometry instead:
exactly **96 of 96** vertices inside the published `ruffRanges` move, **0** vertices outside them
move, and the collar cards' projected area goes **821 → 1612 px** (chest), **257 → 658** (neck L),
**389 → 729** (neck R). Verified before the capture, `scratchpad/ruffverify.mjs`.

**Gate inertness, proven not asserted.** The shipped arm's full-mesh vertex-position hash is
`978c8cd407f6f961`, **bit-identical** to a build of the pre-gate tree (`9892699`). 52/52 §4.7
clips sample in both arms with 0 non-finite bone quats and 0 non-finite vertices.

---

## ROIs — placed from the real projection, not by eye

The three treated ROIs are centred on the published rows' **measured projected card centres** at
the `sly-closeup` camera, one ROI per row, **scored separately, never pooled** (§110.2's rule).

| ROI | box (x0,y0,x1,y1) | row it covers |
|---|---|---|
| `collar-R` | 573, 240, 594, 266 | `neckRuffR` (cards at 585.1,250.7 / 590.7,254.9) |
| `collar-C` | 594, 244, 622, 272 | `chestRuff` (4 cards, 597–614 x, 248–263 y) |
| `collar-L` | 622, 236, 660, 256 | `neckRuffL` (cards at 631.1,244.7 / 644.6,246.6) |

**These are not `PREREG-ruff`'s rectangles** — those were never recorded and are lost. Scored on
the `char14` hold-out pair, the new boxes see the treatment far more strongly and far more
evenly: removal moves them **+14.8 / +35.1 / +12.8** mean luma, against §110's **+14.5 / +5.5 /
+0.1**. So §110.2's headline asymmetry ("neck R +0.1 from a symmetric code row") is substantially
an **ROI-placement artefact**: with the boxes on the measured card projections, all three rows
move by ≥12.8 and the card population is not absent on either side. §110's verdict itself stands
— a prereg's thresholds are scored against the ROIs it fixed in advance, and those were fixed.

### Controls (validity gate, checked FIRST, able to void the run)

| control | box | Δ across the char14 boots |
|---|---|---|
| cheek fur | 598, 196, 636, 222 | **+0.0** |
| cap crown | 600, 130, 668, 160 | **+0.0** |
| chest V low | 592, 286, 640, 316 | **+0.0** |

Each is (a) **outside the WIDENED card bbox** x[571,662] y[234,277] — the reach of arm B, not
merely of the shipped state — and (b) **bit-identical between `char14-ship` and `char14-noruff`**,
two boots 19 minutes apart. (b) doubles as the boot-stability evidence §110.3 demands: these boxes
are ones no animated background element and no cross-owner material drift reaches.

**Void condition:** if any control moves more than **±1.0 levels** of mean luma, something other
than the gate changed and **no verdict is read from the run**.

---

## Pre-committed scoring

**Primary — ink fraction (share of pixels at L<30), per ROI, scored separately.** This is the
statistic that names the mechanism; mean luma is reported alongside but does not decide.

- **CONFIRMED** — ink fraction falls by **≥ 4.0 points** in **at least two of three** ROIs.
- **REFUTED** — all three move **< 1.5 points**, or any ROI's ink fraction **rises**.
- Anything else is **INCONCLUSIVE** and is reported as such, not rounded into either verdict.

### Where 4.0 comes from, and the honest weakness in it

A first attempt to predict the per-ROI change absolutely was **withdrawn because it failed its own
calibration**: run against the shipped frame, which is already on disk, the geometry-only model
missed the observed ink fraction by **−9.9 / −16.8 / +13.4 points** — errors as large as the
effect. A forward model that cannot hit a frame it has seen has no business naming a threshold for
one it has not.

What survives calibration is the **ratio** of modelled hull coverage between two arms of the same
model, where the absolute offset cancels: hull coverage falls **23.1 → 17.3 %** (collar-R),
**13.5 → 8.5 %** (collar-C), **26.4 → 22.5 %** (collar-L), i.e. the widening removes 25 % / 37 % /
15 % of each ROI's card-hull. Applied to the *measured* full swing that total removal produces in
those same boxes (−30.2 / −26.1 / −5.0 ink points), that predicts roughly **−7.6 / −9.6 / −0.7**.
4.0 sits under the first two and above the third, so the test can pass on the two rows the model
says should move and is not rigged to pass on the third.

**`collar-L` is expected to move least and that is a prediction, not an excuse** — it is written
down here so it cannot be produced afterwards as a reason.

## Secondary — LOOKED AT, not computed. This decides shipping.

Both must hold, at 5× on the same crop, ship against wide:

1. **The collar still reads as a scalloped mass** — not a clean geometric arc (the failure that
   blocked the removal) and **not a continuous slab or bib** (the failure the width was cut for in
   `e19b80c`). A card wide enough to beat the hull is a card that can re-fill the collar.
2. **The black chip is visibly reduced** — the jagged dark shards crossing the cream chest in
   `char14-ship` must be smaller in extent or fewer.

**A CONFIRMED primary does not ship on its own.** If (1) fails, the widening is not shipped
whatever the ink numbers do, exactly as the removal was not shipped under the same rule.

## Decision rule, committed now

- CONFIRMED **and** both secondaries hold → **ship the widening** (drop the gate, make it default).
- CONFIRMED **and** secondary (1) fails → **do not ship.** k 1.75 overshot; the next candidate is
  k 1.25 (modelled 40.0 %), which is the last point before the card union merges to one component.
- REFUTED → the width lever is spent. Record it, and hand the ratio's **other side** to SHADING:
  a per-group `outline` weight on the fur groups, which `_material()` currently hardcodes to 1.0
  for every group and which is the only remaining term in `ink / (card + ink)` that CHARACTER
  cannot reach.
- INCONCLUSIVE → report as such. Do not round.

## Known limits of this instrument

- One framing. `sly-closeup` is one of only two frames that can still score character colour and
  material (§96.2); nothing here generalises to the other nine and none is claimed.
- The ROIs are rectangles and cannot separate a card from a shadow *within* the rectangle. That is
  what the `noruff` hold-out already did, and this run inherits its attribution rather than
  re-deriving it.
- Ink fraction at L<30 counts *any* very dark pixel, including body ink and cast shadow inside the
  box. It is a share, not an attribution — which is why the controls and the hold-out both matter.

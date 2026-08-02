# PREREG nightwall — §7.3 "visible texture tiling repetition" at the one framing never tested

TEXTURES, sealed 2026-08-02, before any capture. Repo tree `1006744`; **`src/textures/**`
unchanged since `4a5140b` (10:36)**, so any frame captured after 10:36 is texture-current and no
src edit is proposed — task #23's freeze is respected. Instruments (all CPU-only, no capture
lock): `scratchpad/shotgeo.mjs`, `nightplane.mjs`, `planemap.mjs`, `tileacf.mjs`,
`gildframe.mjs`, `tools/wallstrip.mjs`, `tools/crop.mjs`.

## 0. Correction to the claim that opened this, before anything is built on it

`RESULT-tx7.md` §2 closed with: *"Residual: a closer, better-lit square-on wall (night) remains
untested."* That sentence is **my prose, and two of its three particulars are false**, measured:

| | night wall | interior back wall | temple nave wall |
|---|---|---|---|
| depth of the square-on run | **34.4 m** | 14.9 m | 31.5 m |
| frame luma p5/p50/p95 of the material | 9.4 / **18.9** / 39.3 | 39.2 / **75.4** / 126.3 | 36.9 / **75.6** / 161.7 |
| share of it lit (>120 L) | **0.0 %** | 6.0 % | 23.5 % |

It is **farther and darker**, not closer and better lit. What is true is the third particular:
it is the most nearly square-on (`|N·V|` p50 **0.980** against temple's 0.938) and its wall plane
carries the largest *world* span, 35.1 m = **3.37 repeats** of the 10.4 m tile at **236 px/repeat**.

A second correction from the same file: `RESULT-tx7` §2 computed the interior frieze as "14.2 m =
2.73 repeats of the 5.2 m tile at ~220 px/repeat". `hieroglyph_wall`'s repeat is **10.4 m**
(`Materials.js`: `worldTileOf = tile × ARCH_UV`, `ARCH_UV = 2.0`, and the shipped px/repeat table
in the same file only closes at 10.4). So interior showed **1.37 repeats at ~440 px/repeat**. The
tx7 verdict is unaffected — no landmark was found at any lag — but the claim was half as strong
as it read.

## 1. The eligibility gate, and it is not vacuous

A repeat is countable when the frame presents **two copies the eye can compare**. Registered as a
prerequisite because a null from a framing that cannot show the defect is not evidence:

> **E1** — the largest axis-aligned box that is ≥70 % one square-on (`|N·V| ≥ 0.90`) plane of the
> material, with depth p90/p10 ≤ 1.3, must span **≥ 1.0 repeat**.

Measured now (`planemap.mjs`, architecture geometry, 1280×720):

| shot | best box | coverage | z p50 | px/repeat | **repeats** |
|---|---|---|---|---|---|
| `temple` | (592,248)-(919,387) 328×140 | 70.1 % | 31.5 m | 214 | **1.53 — passes** |
| `night` (far plane) | (160,168)-(263,487) 104×320 | 74.0 % | 34.4 m | 240 | **0.43 — fails** |
| `night` (near plane) | (24,144)-(135,703) 112×560 | 70.5 % | 16.5 m | 499 | **0.22 — fails** |
| `interior` | (840,0)-(967,399) 128×400 | 73.4 % | 14.9 m | 511 | **0.25 — fails** |

`temple` — the one framing tx7 tested and cleared — is the only canonical framing that presents
more than one contiguous copy. The gate therefore discriminates rather than failing everything,
which is the check §22 says to run before trusting an instrument's null.

`night`'s wall plane does span 3.37 repeats of world, but it is **~78 % occluded** by foreground
masses: the tile is glimpsed in fragments, never twice side by side. That is the weaker form of
the defect and it is what leg L2 tests.

## 2. Frozen ROI

`night`, 1280×720. **ROI = (16,168)-(640,404)**, 625×237 px, statistics restricted to
`arch:hieroglyph_wall` pixels inside it (1 px eroded): **66,173 valid px**.

- one material, one plane family — face normal n ≈ (0.00, 0.02, 1.00), i.e. a +Z-facing wall run
  square to the lens, at **33–46 m of view depth** (the world identity of the run is not claimed
  here; only its normal, depth and span are measured);
- the staged subject's bbox in `night` is (654,383)-(779,500) (`m720-night.mask.json`), so the ROI
  clears the character by **14 px in x** and never contains him;
- predicted repeat lag **L = 236 px**, from z p50 35.0 m and `|N·V|` p50 0.980
  (`10.4 m / (z·2·tan(fov/2)/H) × |N·V|`); the shipped table in `Materials.js` independently says
  252 px for this shot — the 6 % gap is the depth spread inside the ROI, and the search window
  below covers both.

## 3. Legs, bands, and what each leg can and cannot see

**L1 — the render at the framing's own px/repeat (deciding).** §13 is binding: no global scalar
in this project separates a known-bad (`cartouche:true`) from the shipped tile — 28 measurements,
max 2.5 % separation — because the landmark is ~1.2 % of the tile. The calibrated instrument is
the render. Deliverables: `tools/crop.mjs` 1:1 crop of the ROI, beside `tools/wallstrip.mjs`
`--rep 236 --nu 3`, judged against the question sealed here: **"is there a mark, accent or motif
that recurs at ~236 px in the frame crop?"**

The mark to look for is **named in advance rather than left to the eye**, which is what makes
this leg falsifiable. Rendered at this framing's own 236 px/repeat and at authored contrast
(`scratchpad/ws-night236.png`), the tile's strongest accents are **red/orange disc glyphs, ~2 per
repeat**, and they line up across repeats at 235–240 px — the same per-repeat residual §13's
per-instance census already names (`ka`, red, n = 2 per tile). So the sealed question is
concrete: **do those disc accents recur at ~236 px in the `night` frame crop?**

- **FAIL** — a recurring mark is identified *and* its spacing measured within ±15 % of 236 px.
- **PASS** — no such mark; the registers read as varied writing at 1:1 and the masses stay clean
  under the squint pass in the same run (§7.3 has two conditions and one must not be bought with
  the other).
- **UNDECIDABLE** — the crop carries too few levels to judge (see the power gate, §4).

**L2 — masked horizontal autocorrelation (supporting, and underpowered by measurement).**
`tileacf.mjs`: wide-box high-pass to remove lighting, NCC over pixels where both the pixel and its
partner at lag L are wall, `support(L)` reported next to every r.

- **FAIL** if r at the peak inside 236 ± 17 % reaches **z ≥ 3.0** against the null distribution
  over all lags 8–420 (threshold set a priori, not from this frame's value).
- **PASS** if z < 1.5 **and** the power statement in §4 holds for the structure being claimed.
- **VOID** if support at the predicted lag < 5,000 pairs.

## 4. Power gate — registered before the read, because a null needs it

The ROI's own signal: wall pixels sit at p5/p50/p95 = **9.4 / 18.9 / 39.3 L**, a p95−p5 range of
**29.9 L against temple's 124.8 L** — 24 % of the value range the same material gets in the
framing where this test passes, and 0.0 % of it above 120 L.

Planted-landmark calibration on the real ROI (`--plant 236,A`, a 6 px bar once per 236 px, i.e.
the same 2.5 %-of-tile geometry as a cartouche): amplitude 1/2/4/8 L returns z = 0.71 / 0.67 /
0.74 / **0.91**. So **L2 cannot see a landmark-shaped repeat at this framing at all** — it is a
test for whole-tile structural recurrence only, and its null must be reported with that sentence
attached. This is §13's finding reproduced at a new framing rather than assumed from it.

**A counter-measurement, recorded because it pushes against the "too dark to test" reading.**
Local pigment-scale variation is *not* absent at night: the 7×7 high-pass RMS of `(r − b)` over
the same wall population is **5.90** at `night` against **5.16** at `temple` and 3.49 at
`interior` (local L RMS 7.67 / 7.94 / 6.65). Whatever is limiting this framing, it is the global
value range (29.9 L vs 124.8 L) and the contiguity gate — **not** an absence of local structure.
L1 must therefore be run and looked at rather than declared undecidable from the luma alone.

## 5. Pilot on two existing texture-current frames — quarantined, and it does not set a band

Run now, on frames that already exist, so the capture (if it runs) is not the first look:
`shots/bud35/night.png` (`c61941c`, 12:23) and `shots/creamfix/night-base.png` (`d0f781c`, 14:57).
Both post-date the last `src/textures/**` commit, so both are texture-current.

- L2, both frames: peak inside 236 ± 17 % is r = 0.0296 / 0.0294 at lag 203 / 201, **z = 0.75**;
  the strongest lag anywhere is ~325 px at r = 0.063 (z ≈ 1.4), which is not the tile period.
  Support at the predicted lag 13–17 k pairs. Two independent boots agree to within r = 0.006.
- L1, first look at the crops (`scratchpad/nw-roi.png` 1:1, `nw-zoom.png` at 3×): the glyph
  registers are present as rows of small **cyan dashes** on a near-black blue field — the strokes
  survive as rim/moon catches, and the tile's red disc accents named in §3 **are not present at
  all**. A landmark that does not survive the lighting cannot be counted; that is a different
  reason from "the wall is clean", and the two must not be reported as the same verdict.

**Barred from tightening anything above**, per §27.5: three counts of agreement would justify a
narrower band and taking it would be fitting the band to the evidence it exists to test.

## 6. The capture, if it runs — and the honest recommendation

**Recommendation: this framing does not need a lock slot.** It fails E1 by 2.3× on its best box,
its wall carries a quarter of the value range of the framing where the test discriminates, its
only scalar leg is measured to be blind to the defect shape, and two texture-current frames
already exist and agree. The capture buys currency of the *grade*, not of the texture.

If the coordinator still wants it in the queue, it is one shot and it should carry a control:

- shots `night` **and `temple`** in one boot (temple is the positive-control framing, E1 = 1.53);
- 1280×720, quality `high`, `SANDS_NO_HMR=1`, clock pinned — `step(n, 0)` (§28) — and the
  provenance stamp read out of `report.json` before any number is quoted (§18);
- one arm only; there is nothing to A/B, so no null-control arm is required and none is claimed.

**Remedy, written as a function of state, not of schedule (§26.3).** If L1 returns FAIL on
`night`, the finding is a texture-authoring one and the fix is mine: the lever is the tile's
landmark inventory (§13's per-instance census — count the parts), **not** `HG_WALL_TILE`, which
is measured-and-declined because it trades this condition for §7.3's carving-detail condition. If
L1 returns PASS or UNDECIDABLE, `night` is recorded as **not a framing at which this condition can
be demonstrated**, and §7.3's tiling line rests where tx7 left it: cleared at `temple` (the only
framing with >1 contiguous repeat), at `interior`, and — by `wallstrip` off the albedo — at
`dunes`.

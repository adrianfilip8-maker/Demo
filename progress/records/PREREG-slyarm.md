# PREREG — the sleeve→forearm silhouette event, scored on `sly-arm`

Sealed **before `shots/slyarm/` contains a single file**. Tree at sealing: `8d558b1`
(`src/**` bit-identical to `1bc8938`, the critic6 boot). Instrument:
`scratchpad/armprofile.mjs`, control-checked against `scratchpad/armframe.mjs`.

This registers the **measurement**. The *precondition* (that a forearm is on the outline at
all) was registered in §66 and is re-verified here.

---

## 0. The headline, so it cannot be lost below

**§58.4's registered primary verdict is not computable on `sly-arm`.** Its ruler — the
forearm→glove-cuff step — **is not on the outline in this framing**: `CUFF = 0` rows. The arm
run ends at y=433 into the **cane**, which crosses in front of the wrist in `cane_combo_2`.
Its abort clause ("abort if the forearm→cuff ruler itself misses 15–28 px") would therefore
fire on a **missing** ruler, and the boot would produce an abort that says nothing about fur.

This is §69's shape again — *an abort clause unmeetable in the frame it will be scored on* —
caught before the frame exists, which is what a pre-registration is for.

**Re-registered below against a ruler that exists.**

---

## 1. The unit trap is dissolved structurally, not by a ratio

§58.4 chose a unit-free ratio because the 1.7 px / 19 px readings were `shotsil@900` against a
720-row capture. `armprofile.mjs` rasterises **the shot's own camera at the capture's own
1280×720**. There is no conversion step anywhere in the file, so prediction and test are
already in the same units. The ratio is retained as a *secondary*, not as the primary.

> **Correction to §58.4's own arithmetic, which should not be quoted onward.** Its stated
> "1.44× conversion" is not consistent with its own converted values: 1.7→1.4 and 19→15.4 are
> both ~1.22–1.25×, i.e. the 900→720 row ratio. More importantly its **B ratio is a units
> mix**: `A = 0.07` is `1.7/26` (both @900) but `B = 0.58` is `15.2/26` — a 720-converted
> numerator over a 900-unit denominator. Consistently computed, **B = 19/26 = 0.73**, not 0.58.
> The verdict would not have flipped (both sit above the 0.15–0.40 indeterminate band), but the
> registered target was 26% low, and a result landing at 0.60 would have been scored as
> "matches B" when B predicts 0.73. *The error the section exists to prevent is committed
> inside the section's own correction.*

## 2. What the instrument says, sealed as the prediction

`node armprofile.mjs sly-arm` → **all numbers raw geometry px at 1280×720, ink hull NOT
subtracted, no conversion:**

```
figure: rows 119..661 = 543 px tall            (301.7 px/m overall; 310.2 px/m at the arm's depth)
right-outline owners: HEAD=181 LEG=137 CANE=91 FOREARM=63 SLEEVE=60 SHOULDER=11
band rows on right outline: SLEEVE=60  FOREARM=63  CUFF=0  ARMOTHER=0

sleeve -> forearm (t=0.76, clothSwell 1.235->1.000):  y=371   706.3 -> 716.3 px   STEP +10.00 px
forearm -> cuff   (t=0.965, rx x1.14):                NOT ON THE OUTLINE
```

**CONTROL, passed:** `SLEEVE 60 + FOREARM 63 = 123` reproduces `armframe.mjs exact sly-arm`'s
independent `ARM=123` on the same side, exactly. The material-band labelling is therefore
consistent with the bone labelling that §66 registered, and the 62 depth-qualified rows from
y=372 are the **bare-fur band** (FOREARM, y 371–433) — the framing measures what it was built
to measure.

**Net of local drift.** The outboard edge drifts ~0.2 px/row through the sleeve approach
(y 361–370: 705→707) and ~0.8 px/row after the hem (y 371–380: 715→722). Across the two 4-row
averaging windows that is ~2 px of drift, so the **discontinuity is ~8 px of the gross 10 px**.
Both figures are registered; the claim is scored on the gross with the net quoted beside it.

## 3. The registered readings

| | reading | gross step at y=371 | verdict |
|---|---|---|---|
| **A** | hem is buried inside its own ink line | ≤ 3 px | fur does NOT break the silhouette; §7.3 arms condition stands, and geometry is not the lever |
| **B** | hem is a visible notch | ≥ 6 px | fur DOES break the silhouette on the backs of the arms; the arms sub-claim is **met** in this pose |
| **C** | the event is an artefact of low-`n` binning | — | **retired, see below** |

Indeterminate: **3–6 px.** Pre-registered expectation: **B**, at 10 px gross / ~8 px net.

**Reading C is retired, not withdrawn and not confirmed.** §58.5 registered C because
`armscale.mjs` bins by vertex and has a demonstrated false positive at `u = 0.662, n = 4`.
`armprofile.mjs` **has no bins** — it reads per-row ownership off a z-buffered raster, so a
sparse vertex bin cannot manufacture an event in it. C was a property of the retired
instrument, not a hypothesis about the arm. Its control bin therefore has no home here and
needs none; that is the honest disposition, rather than leaving it open forever.

## 4. Secondary, unit-free — with a ruler that exists in the frame

The registered ruler is absent, so the secondary is scored against the two rulers that **are**
in this frame and are body features:

- `R_fig = step / figureHeight`. Predicted **10.0 / 543 = 0.0184**.
- `R_arm = step / (FOREARM band length in rows)`. Predicted **10.0 / 63 = 0.159**.

Both are dimensionless and survive any resolution change. Neither is load-bearing: **the
primary is the absolute px against the ~2.5 px ink hull**, because the ink hull is
screen-space constant by design (outline thickness is scaled to hold ~2.5 px), so a
*proportion* cannot answer "is it buried in the line" and only an absolute can.

## 5. Abort clauses — each one meetable in this frame, checked

- Abort if `armprofile`'s CONTROL disagrees with `armframe`'s ARM row count. *(Checked now: 123 = 123, passes.)*
- Abort if the FOREARM band is not on the right outline for ≥ 40 consecutive rows. *(Checked now: 63 rows, passes.)*
- Abort if the PNG's figure height is not 543 ± 8 px — that would mean the shipped staging is
  not the staging this was computed on, and no px number transfers. *(Testable the moment the
  frame lands.)*
- **No abort is written against the forearm→cuff ruler**, because it is absent by construction
  in this pose and its absence is not evidence about fur.

## 6. What the frame can and cannot settle

**Can:** whether the authored hem event survives to a rendered pixel — shader, ink hull,
tonemap and antialiasing included. That is the whole distance between this tool and the PNG.

**Cannot:** whether the *bare forearm fur band itself* reads as fur rather than as a smooth
tube. The hem is one step at one row. §47's "nothing can resolve there" and §68's "most of
'reads as flat' is the tone curve" both bear on the band between y 371 and 433, and neither is
answered by a step measurement.

## 7. Scoring against critic pass 6 — registered in advance

`sly-arm` is **not** in the scored roster, and §66.1 measured that **no scored shot puts a
forearm on the outline** (`sly-closeup`: ARM=0 on both sides). So:

- **Pass 6 silence on the arms is uninformative and is registered as such now.** It is
  consistent with fixed, unfixed, and unobservable — §49's "a zero is not one state".
- Pass 6's verdict on "fur reads as smooth plastic" **does** carry, but only for the surfaces
  its frames can see: tail, cheeks, chest, legs. A fur remark from pass 6 must not be routed to
  the arms item, and an arms result must not be quoted as answering the fur condition overall.
- The arms sub-claim is scored **only** against the instrument and the `sly-arm` PNG.

# PREREG — smiley: D9's grin, attributed to named geometry and gated on silhouette only

Registered **before the candidate geometry exists**. Instrument, arms and thresholds below are
sealed; §141.1 applies — no threshold moves after a candidate is measured, and no gate is
re-scoped after seeing which one failed.

Instrument: `progress/records/statueread.mjs`. Headless — no GPU, no capture lock, no shader,
no PostFX. It runs `Props.init()` (same seed, same call order as the game), tags every
`Bag.add` with the source line that made it, projects with the real `courtyard` camera
(fov 55, roll 0.8) at 1280x720, and rasterises a per-feature ID + view-depth buffer with
Architecture as an occluder. Every number below is frame pixels at 1280x720 — the resolution
critic 9 scored — never a magnification (`tools/crop.mjs`'s warning).

**Why a geometric instrument and not a captured frame.** D9 is a silhouette and
feature-proportion claim. §269's shadow-band work shipped inert, so shadow luminance has not
moved — but the per-material scoping question is live with the materials agent, and every
luminance on the colossi's shaded half could still move. Nothing measured here can be moved by
that work in either direction, because nothing here reads a colour.

**What this instrument therefore cannot say**, stated as the gap rather than the measurement
(§11): whether the carved face *out-contrasts* the accidental one once it is lit. That is the
other half of D9, it is downstream of the shadow-band decision, and it is not claimed here.

---

## 0. The attribution — derived before any change, and it is not what D9 assumed

D9 reads: "an upturned gold arc at the base that reads unambiguously as a **grinning mouth**, a
slab nose, and a cyan-ringed circle that reads as a single eye."

Every one of those three is a named piece of geometry, and none of them is the statue's face:

| what the critic saw | what it actually is | east centroid | west centroid |
|---|---|---|---|
| "single eye" | `uraeus()` — the cobra at the brow | 1018,132 | 205,62 |
| "slab nose" | the **false beard** | 1019,249 | 197,201 |
| "grinning mouth" | the **broad collar** (`PropKit.collar`, arc 1.25π / 0.86π) | 1015,328 | 200,285 |

Three high-contrast marks, all within 4 px of the figure's own centreline, stacked at facial
spacing. They form a face at roughly **three times the scale of the carved one**, and the carved
face sits inside that arrangement doing nothing about it.

`collar()` builds a `TorusGeometry` arc rotated `-arc/2 - π/2`, which centres the sweep on the
**bottom** of the ring: a 225° arc seen frontally is a crescent with its horns up. The grin is
not an accident of shading. It is the shape that is authored.

### Two hypotheses refuted before the candidate exists

1. **"A feature 4 px across cannot be fixed by adding detail."** The carved face is not 4 px.
   It measures **136 x 50 px (west, 2,976 visible px)** and **95 x 37 px (east, 1,771 px)**.
   The figures themselves are **321 x 517 px (71.8% of frame height, west)** and
   **319 x 431 px (59.9%, east)**. There is ample angular size for a face; the face is being
   out-competed, not out-resolved. "Stop spending pixels on a face at this angular size" is
   therefore the wrong prescription and is not what this run does.
2. **"The face is a flat plate painted on a flat slab."** RMS view-depth residual about the
   least-squares plane fitted to the face box: **19.0 cm (west), 21.8 cm (east)**. The face is
   modelled. (The first draft of this metric reported raw p5–p95 depth spread and read 86 cm on
   the same geometry — it was measuring the head block's obliquity, not its relief. Corrected
   before registration; §186.2's failure family.)

---

## 1. Arms

| arm | what it is | why |
|---|---|---|
| **CALIBRATION** | the current tree, unmodified | must FAIL every gate below. A run whose calibration passes has no sensitivity and is void. |
| **NULL (repeatability)** | `--seed 7`, `--seed 99` — re-rolls every jitter / chip / wear draw, changes no authored dimension | a metric that moves across its threshold under the null was reading noise |
| **SCATTER (structure)** | `--scatter` — the collar's pixels replaced by the same count scattered over the same bbox | proves the arc measure selects *shape*, not marks (`tools/crop.mjs`'s recommended control) |
| **CANDIDATE** | the changed `Statues.js` | scored against the sealed thresholds |

Calibration and null are already run and recorded here, before the candidate exists:

```
CALIBRATION (current tree)
  I1  west stripes 11.7% outside, max protrusion 47 px | east 17.8%, 31 px
  I2  west collar span 0.50 fill 0.124 rise +20.0 px   | east span 0.45 fill 0.402 rise +11.1
  I3  5 bands / 12-15 px thick / 32-41 px period on all four lappets
  I4  west 42 px jump (15.6% of head width in one row) | east 16 px (8.0%)
  I5  west RMS residual 19.03 cm | east 21.75 cm

NULL  seed 7  : I1 12.2% / 47 px, 12.8% / 17 px · I2 rise +40.2/+5.6 (col-mean draft) · I3 identical · I4 43 / 52
NULL  seed 99 : I1 11.8% / 46 px, 12.8% / 17 px · I2 rise +42.0/+5.2 (col-mean draft) · I3 identical · I4 41 / 50
SCATTER       : I2 rise +2.4 / +0.8 against +20.0 / +11.1 — the arc measure is a shape measure
```

---

## 2. Gates. PASS ships; FAIL and VOID do not (`tools/gate.mjs` tri-state).

### G1 — no applied inlay may protrude from the figure's massing silhouette
Metric: I1 on `LAPPET stripes`, both sides — `pct` (inlay px outside the massing silhouette) and
`maxdx` (largest lateral protrusion).
**PASS iff `pct <= 1.0%` on both sides AND `maxdx <= 8 px` on both sides.**
8 px is derived, not chosen: the belt/cartouche is an inlay authored strictly inside its host and
it still reads 7 px on the east figure, so 7 px is this scene's measured floor for a
rasterisation sliver at a shared arris. Nothing defends a nemes stripe standing 47 px out into
the sky.
VOID if `LAPPET stripes` is absent from the feature table.

### G2 — the broad collar must be a garment, not a mark
Metric: I2 on the colossus collar, both sides — `span` (collar width / the figure's own width at
the collar's centroid row) and `fill` (collar px / bbox area).
**PASS iff `span >= 0.80` AND `fill >= 0.55` on both sides.**
A wesekh is worn shoulder to shoulder and is a solid bib of strung rows; a mouth on a face is
about half the face wide and is a line. `span` and `fill` are exactly that difference, and
neither is a taste judgement.
`rise` is **reported and not gated**: a real bib legitimately hangs lower at the centre, so a
rise ceiling would penalise the correct shape. The scatter null (+2.4 / +0.8 against
+20.0 / +11.1) is what licenses reporting it at all.
VOID if the collar feature is absent.

### G3 — the nemes must band as cloth, not as bars
Metric: I3 on all four lappets — band count and median band thickness down each lappet's densest
column.
**PASS iff `bands >= 9` AND `median band thickness <= 8 px` on all four lappets.**
8 px is this project's own established "reads as a mark, not an object" size — settled on the
ember sprites in `Particles.js` TUNE (commit `dc8597c`) against a camera in this same scene. The
critic's own "single eye" candidate, the uraeus, is 37 x 51 px, and the carved eye plate is
~40 x 9 px, so a 12–15 px bar is eye-scale by the frame's own measure.

### Reported, not gated
- **I4 STEP.** A stepped crown is an authored decision — `nemes()`'s own comment argues for three
  terraces so "the ink line reads three steps, not one dome" — and reversing another author's
  deliberate choice is not this run's business. The number is recorded so the step stays visible.
- **I5 RELIEF.** Recorded because it refutes a hypothesis I held (see §0), not because it is a
  target.

---

## 3. Falsifiers

- Any gate VOID ⇒ no ship. VOID is not PASS.
- If the repeatability null moves any **gated** metric across its threshold, that gate is void
  and the run does not ship on it.
- If the candidate passes every gate but either figure's overall pixel extent changes by more
  than **15%**, the change has altered the composition rather than the read. That must be
  reported as a cost, and the frame re-looked-at, before anything is called done.
- **The anti-mirror constraint is preserved or the run is reported as breaking it.** `Props._colossi`
  deliberately gives the two figures different collar arcs because the matched pair was measured
  as the dominant "mirrored buildings" tell in `courtyard`. Whatever the collar becomes, the two
  figures must still differ in it. If the candidate makes them identical, that is a regression
  this run caused and it gets written down.
- If a gate passes and the rendered frame still reads as a face, the instrument was wrong and
  says so — the gates are necessary conditions I can measure, not a proof of the percept.

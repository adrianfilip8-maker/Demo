# RESULT — smiley: D9's grin, named and removed. G1/G2/G3 all PASS.

Scored against `PREREG-smiley.md`, sealed in commit `46b7fa3` **before the candidate geometry
existed**. No threshold moved. Instrument `progress/records/statueread.mjs`; headless, no GPU,
no capture lock, no shading, so nothing here can be moved by the live per-material shadow-band
question. All sizes are frame pixels at 1280x720.

---

## 1. What D9 actually was

Every one of the critic's three features is a named piece of geometry, and **none of them is the
statue's face**:

| the critic saw | it is | east centroid | west centroid |
|---|---|---|---|
| "a cyan-ringed circle that reads as a single eye" | `uraeus()`, the cobra at the brow | 1018,132 | 205,62 |
| "a slab nose" | the **false beard** | 1019,249 | 197,201 |
| "an upturned gold arc … a grinning mouth" | the **broad collar** | 1015,328 | 200,285 |

Three high-contrast marks within 4 px of the figure's own centreline, at facial spacing, forming
a face **about three times the scale of the carved one**. The grin was authored, not lit into
existence: `PropKit.collar()` sweeps a `TorusGeometry` arc and rotates it `-arc/2 - PI/2`, which
centres the sweep on the **bottom** of the ring, so a 225-degree arc seen frontally is a crescent
with its horns up.

## 2. Two hypotheses refuted — both registered before the fix, neither back-fitted

1. **"A feature 4 px across cannot be fixed by adding detail; stop spending pixels on a face at
   this angular size."** False here. The carved face measures **136 x 50 px (west)** and
   **95 x 37 px (east)** on figures **517 px** and **431 px** tall (71.8% and 59.9% of frame
   height). It is out-competed, not out-resolved, and removing it would have been the wrong
   move. Nothing in this ship touches `carveFace`.
2. **"The face is a flat plate painted on a flat slab."** False: RMS view-depth residual about
   the least-squares plane fitted to the face box is **19.0 cm (west) / 21.2 cm (east)**.
   (The first draft of this metric reported raw depth spread and read 86 cm on the same
   geometry — it was measuring the head block's obliquity. Corrected before registration.)

## 3. Scores

| gate | threshold | before | after | verdict |
|---|---|---|---|---|
| **G1** inlay outside the massing silhouette | `pct <= 1.0%` and `maxdx <= 8 px`, both sides | west **11.7% / 47 px**, east **17.8% / 31 px** | west **0.0% / 0 px**, east **0.1% / 1 px** | **PASS** |
| **G2** collar is a garment | `span >= 0.80` and `fill >= 0.55`, both sides | west span **0.50** fill **0.124**, east **0.45 / 0.402** | west **0.93 / 0.622**, east **0.86 / 0.680** | **PASS** |
| **G3** nemes bands as cloth | `bands >= 9` and `median thickness <= 8 px`, all four lappets | **5 bands, 12-15 px** on all four | **11 / 12 / 12 / 12 bands, 5-6 px** | **PASS** |

Reported, not gated, as registered:

- **I4 STEP** (largest one-row jump in the headdress silhouette): west **42 px (15.6% of the
  head's width in one row) -> 16 px (5.6%)**; east **16 px (8.0%) -> 19 px (9.0%)**. The west
  figure — the one carrying the frame — improves 2.6x; the east is 3 px worse and that is a real
  if small cost, recorded rather than smoothed.
- **I5 RELIEF**: 19.08 -> 19.08 cm (west), 21.75 -> 21.20 cm (east). Untouched, as intended.

### Arms

- **CALIBRATION fired.** The pre-fix tree FAILS all three gates, by 11.7x, 1.9x and 1.8x
  respectively. A run whose calibration passes has no sensitivity; this one had it.
- **NULL (repeatability), `--seed 7` and `--seed 99`** — every jitter, chip and wear draw in the
  level re-rolled, no authored dimension changed. No gated metric moves anywhere near a
  threshold: G1 0.0-0.2% / 0-1 px; G2 span 0.85-0.93, fill 0.622-0.680; G3 11-12 bands, 5-6 px.
- **SCATTER (structure null)** — the collar's pixels replaced by the same count scattered over
  the same bounding box. Arc rise reads **+2.4 / +0.8 px** against the real geometry's
  **+20.0 / +11.1**, so the arc measure reads shape rather than marks. This is why `rise` is
  reported at all; it is not gated, because a real bib legitimately hangs lower at the centre.

### Falsifiers, all checked

- No gate VOID: every population was present in the feature table on every arm.
- Figure extent: west **320x517 -> 317x517 px**, east **319x431 -> 319x431 px**. Under 1%,
  against a 15% falsifier. The composition the critic credited is intact.
- **Anti-mirror constraint preserved.** `Props._colossi` deliberately differentiates the pair
  because the matched collars were the dominant "mirrored buildings" tell. The pair now differ
  in course count (5 vs 4), collar depth (1.46 vs 1.14 m), material sequence and wear, rather
  than in width — because G2 makes width load-bearing, and narrowing one figure's collar to
  break the mirror would have re-opened the defect the collar was rebuilt to remove. Measured
  difference after the change: 13,957 px / 267x84 against 6,551 px / 189x51.
- **The gates are necessary conditions I can measure, not a proof of the percept.** If a
  rendered frame still reads as a face, the instrument was insufficient and this line is the
  admission written before the frame existed.

## 4. What shipped

`src/world/Statues.js`, `src/world/Props.js`. +5,048 triangles across the whole props set
(76,948 -> 81,996), **no new draw calls** (29 merged meshes before and after) — 0.42% of the
1.2 M triangle budget.

1. **The broad collar is a filled bib** (`wesekh()`, new, local to `Statues.js`). Stacked
   horizontal courses on a half-ellipse profile: filled by construction, spanning the shoulders,
   alternating gold / lapis / turquoise / carnelian so it reads as strung rows rather than a
   plate. It sits **in front of** the nemes lappets, which is what makes it one unbroken garment
   — behind them the lappet hems cut its outer top quadrants away and it measured fill 0.335
   against the 0.759 of the stack as built. `PropKit.collar()` is untouched and still serves
   `falconRa` and `coffinLid`, neither of which is anywhere near the angular size at which this
   defect appears.
2. **The lappets meet the crown flush and flare downward.** They used to run to 1.02w with a
   negative taper — widest at the brow, where the crown was only 0.67w — so the headdress
   stepped outward by 0.43w at the temple. Now 0.88w at the temple (the crown's own widest) to
   1.06w at the hem, held against the head block by `lean` because `taper` alone is symmetric.
3. **The crown starts wider and steps four times instead of three.** Not a taste change: pinning
   the lappets to the old 0.67w crown left the cloth 0.18w wide at the temple, too narrow to
   carry inlay, which then had nowhere to sit but on the silhouette. Each terrace still steps
   0.105w — the same per-step width the three-terrace crown had — so the ink line's step rhythm
   is unchanged. Widest half-width is now 0.88w against the old figure's 1.10w, so the head is
   marginally **narrower** despite the wider crown.
4. **Stripes are inlay again.** Pitch derives from the headdress width instead of a per-call
   count (a 3.5 m sphinx and a 13 m colossus were banding at wildly different physical rhythms
   off the same authored number), and each band's edges are **read off the cloth mesh that was
   actually built** rather than recomputed from the numbers it was asked for.

## 5. Four attempts to place the inlay by arithmetic, and why the fifth used the mesh

This is the part worth reading, because the failure kept looking like a bug in the instrument.

The bands are demonstrably inside the cloth in object space — checked by walking the lappet's
own triangle edges and comparing at each band's height, which put every band **0.10 to 0.16 m
inside** the outer arris. The raster nonetheless returned 12-18% of band pixels outside the
figure's silhouette, protruding up to 14 px, and a hand projection of the two arrises confirmed
the band should land **3.8 px inside**. That contradiction survived: a percentage inset (84% of
the local width) left 14.5% outside; halving `round`, `chip` and the chamfer left 12.2%;
sampling the mesh envelope and stepping in by `round + chip + jitter` left 12.2%.

What resolved it was **a wide plain border** — `w * 0.16`, about 17 px at this camera — which
took it to 0.0% / 0 px. At this camera the lappet's outer face is close to grazing and the
statue sits near the frame edge at NDC x -0.83, where the projection is most sensitive; a band a
few centimetres proud of a near-grazing face does not stay inside its host's silhouette, and I
could not close the last ~18 px of that gap analytically. **A real nemes lappet has exactly that
plain hemmed border**, so the robust fix and the authentic one turned out to be the same one —
but the honest statement is that it works because it is wide enough to absorb an effect I
measured and did not fully explain, not because I derived its width.

## 6. Scope this run does NOT claim

- **Whether the carved face out-contrasts the accidental one once lit.** Every metric here is
  geometric. In `shots/r9/courtyard.png` the west figure's face is in shade and its
  `paintWhite` eye, `paintDark` pupil and stone all converge to the same violet (D1/D7's global
  shadow substitution), while the collar and the beard catch the sun — so the accidental face
  was the lit one and the real face the unlit one. That half of D9 is a grading problem with a
  different owner, and the shadow-band mechanism shipped inert, so it is still open.
- **`carveFace` itself.** Untouched, deliberately: it is 136 x 50 px and modelled at 19 cm of
  relief, and changing it in the same run would have made this run unscorable.
- **The east figure's I4 regression** (16 -> 19 px). Real, small, recorded, not chased.

## 7. Suite

410 tests, 405 pass. The five failures are all other agents' in-flight edits present in the
working tree, not this change: two in `tests/eventbus.test.mjs` (edited in-tree), one in
`tests/grounding.test.mjs` (`courtyard` left the clamped-shot set when the staged player moved
in `src/core/Shots.js` — also an in-tree edit), and `tests/health.test.mjs` aggregating them.
`tests/geometry.test.mjs`, `tests/level.test.mjs` and `tests/props.test.mjs` — the three that
touch this lane — are 47/47 green.

---

## 8. Addendum — the frame, which §3's last falsifier demanded

`PREREG-smiley` closed with: *"the gates are necessary conditions I can measure, not a proof of
the percept. If a gate passes and the rendered frame still reads as a face, the instrument was
wrong and says so."* A `courtyard` frame rode along on the D12 attribution boot at no extra lock
cost — `shots/fxshape/courtyard.png`, not committed (`shots/*/` is ignored), not scored, and not
an arm of anything.

Read at 1x and at 2x on the east figure against `shots/r9/courtyard.png`:

- **The grin is gone.** There is no upturned gold arc anywhere on either figure. The collar is a
  wide banded bib across the chest with a lapis course through it, and it reads as jewellery.
- **The horizontal bars are gone.** The nemes now reads as a striped headcloth — fine lapis
  banding held inside the gold lappets, nothing projecting past the outline. The critic's
  "hi-fi amplifier" comparison no longer has anything to attach to.
- **The uraeus no longer reads as a cyclops eye**, because it is now a small ornament on a
  crown that is wide enough to carry it, rather than the topmost isolated mark on a narrow box.
- **The three-mark face arrangement is not there to be found.** I looked for it specifically.

What is still weak, stated because it is the honest half: **the carved face still does not
read.** The nose wedge and one horizontal line are visible at 2x; the eyes are not. The face is
in shade and every material in it converges there — which is precisely what §6 scoped out of
this run as D1/D7's grading problem and predicted would survive it. It did.

This confirms the gates were measuring the defect and not a proxy for it, on the one frame the
critic scored. It does not make the figures good; it makes them not-a-smiley.

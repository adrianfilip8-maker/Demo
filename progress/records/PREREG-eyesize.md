# PREREG-eyesize — rest-state eye size (+ the iris-value half, measured discharged), projected at both bearings before any capture

**Owner:** CHARACTER. **Tree at registration:** HEAD `a052771`, `src/**` clean, srcTree
`820ace395b9664ae` (`find src -name '*.js' | sort | xargs sha256sum | sha256sum`, repo root,
repo-relative paths — `sha256sum` hashes the paths too). **No `src/**` edit has been made.**
This file registers the candidate, the gates and the falsifiers; the frame rules.

**Question** (CRITIC-sbs1 §4 gap #3; CHAR-sbs1 §5.1–5.2, confirmed on the fresh `8640769`
frame; ROUTE-char12-sighted "the eyes… the one I would do first"): the rest-state eye discs are
2.5–3× canon — single-disc eye:face **0.324 / 0.375** against canon ≈ **0.10–0.15**, disc
heights 45/54 %hh against the real Sly 3 snap's 16.7 %hh — and the domino mask, §7.3's named
identity feature, survives only as slivers (13 px inter-eye divider, 10 px outboard strip,
remnant:cheek 0.540 vs canon 0.256) because the discs consume its area. Both §7.4 blind pairs
lost on exactly this. Is there an eye-geometry change that lands eye:face in a canon-bracketing
band at `sly-closeup` (33.2°) while keeping a legible eye at `combat` (44.9°), returning the
mask band, and leaving the shipped eye ledger — bloom onset `6f1d1f4`, per-channel
`TUNE.scleraTint` (the §33-ledger successor of the 0.15 scalar), the eye-1-verified luma
hierarchy, `SPEC-startle-pupils`' bone mechanism, and the §166 `capYaw` ship — untouched?

---

## 1. The candidate

**`eyesize55`: a lens-plane scale E = 0.55 on the four parts `_buildEye` authors (sclera,
pupil, glint, lid) and the in-plane `_eyeFrame` offsets — `right`/`trueUp` components only;
every `outward` offset and every z-radius is byte-identical.** Token arm per §153.5
(default-off, never edit-and-revert), read per call like every `CHAR_AB` site:

```js
/* module scope, beside CHAR_AB */
const EYE_E = () => (CHAR_AB('eyebead15') ? 0.15 : CHAR_AB('eyesize55') ? 0.55 : 1.0);

/* _eyeFrame: trueUp offset scales, outward clearance does not */
const E = EYE_E();
const pc = c.clone().addScaledVector(outward, 0.020 * S).addScaledVector(trueUp, 0.013 * S * E);

/* _buildEye: const E = EYE_E(), gE = Math.max(E, 0.62);
   sclera radii (0.086*S*E, 0.092*S*E, 0.032*S)
   pupil  radii (0.042*S*E, 0.050*S*E, 0.020*S)
   glint  centre pc + outward*0.014*S + trueUp*0.020*S*E + right*(-side*0.015*S*E)
   glint  radii (0.013*S*gE, 0.013*S*gE, 0.009*S)      // gE floors the catchlight, §4 below
   lid    radii (0.091*S*E, 0.097*S*E, 0.033*S) */
```

**Deliberately untouched, each for a recorded reason:**
- **The mask band and the per-eye annulus** (`_buildMask`: `half` profile, `eAx`/`eAy` from the
  0.086/0.092 literals, `MASK_OUT` 1.62, `MASK_TEMPLE` 1.30). The annulus is the enclosure
  guarantee and its inner hole is backed by the band at inflate 1.058, so a smaller lens inside
  today's annulus turns former disc pixels back into visible mask **automatically** — the
  CHAR-sbs1 §5.2 mechanism ("fixing disc size returns the band; the divider and strip are
  already authored and dark"). Scaling the annulus down would *shrink* the mask footprint and
  the temple sweep — the one face shape that survives at `hero` distance.
- **`TUNE.scleraTint`, `PAL.eyeWhite`, `PAL.ink`, the eye `emissive`, bloom** — the shipped
  value ledger. §2 shows the value half of gap #3 is already discharged on the fresh frame.
- **`biasNormals` dirs/amounts, `EYE_SHADE_N` logic, seg counts, `_eyeFrame` angles/SINK** —
  the matched-pair shading fix and the flat-lens shading are load-bearing (`_buildEye` header).
- **Brows, `capYaw`, everything outside `_buildEye`/`_eyeFrame`.**

**Treated population, measured rather than inferred (§153.3):** **1,178 vertices** — per side
sclera 187, pupil 150, glint 150, lid 102 — counted in the built geometry by `eyesize-proj.mjs`
via the `shadeN` biasNormals signature (six calls, amounts 0.90/0.90/0.95 ×2, unique to the eye
build) cross-checked against the published `pupilRanges` verbatim. No body-loft, cap, mask-band,
annulus or fur-card vertex moves. Skeleton: the pupil bones' bind is `_eyeFrame().pc`, so they
follow the edit with no second site; at rest they are identity, so **rest-pose skinning of the
scaled geometry is exact** and `SPEC-startle-pupils` is untouched mechanically (its 0.35
constriction now acts on an E-scaled disc — a startle-capture consequence noted for that spec's
own seal, not a gate here).

## 2. The "iris value" half — measured DISCHARGED on the fresh frame, so the candidate is geometry-only

CRITIC-sbs1 named gap #3 "rest-state eye size **+ iris value**", from 1,864 amber-classifier px
(hue 25–50°, sat 0.30–0.65, L 110–210) in the stale `eye1` head box. Re-attributed on the fresh
committed frame (`progress/records/sbs1/sly-closeup.png`, same classifier, same head box
540,96,780,245; measurement definitions per §122.1):

- **947 amber px total, of which only 176 lie inside the two disc bboxes (163 screen-left / 13
  screen-right) — 81% is off-eye** (rows 96–110: backdrop/crown above the eyes; rows 190–245:
  warm muzzle/chin). The **30 px "longest amber run" sits at row 100, on the backdrop above the
  cap, not in an eye.** Disc-interior longest amber runs: **13 / 5 px**.
- The pale disc body measures **p50 RGB [158,156,152] / [156,155,152] at L 156.2/155.0** —
  neutral, at the exact L156 design point of the shipped per-channel `scleraTint` — where the
  pre-scleraTint `eye1` sclera measured (183,153,113), sat 0.38, i.e. the amber the classifier
  was counting. **The shipped scleraTint pair already removed the iris-value defect; what
  remains of gap #3 is area, not value.** The pupil (`ink` at the shipped hierarchy's L≈53,
  divider ink measured L37.6) already sits at/below the R2 canon iris value (iris:sclera
  0.434 = 67.3/154.9 in `sbs1-measure-out.json`).

So: **no albedo constant is a lever in this prereg** — an albedo arm would re-open the
eye1-verified ship and put two treatments in one candidate. The iris-value target survives as a
**frame gate** (GATE 4: dark-interior:pale ratio ≤ 0.55, R2's 0.434 inside the band, and the
neutral pale p50 must not move) plus a **negative control**: the head-box longest amber run
(the backdrop 30 px) is untreated and must stay in [20, 40] on EVERY arm including the
known-bad — if it tracks the treatment, the §2 attribution is wrong and the scoring is void.

## 3. Alternatives closed against records before spending anything

- **Uniform 3-D scale of the unit** — closed by this prereg's own instrument, first run
  (recorded in the tool header): the sclera centre sits at SINK 0.92 with the band at 1.058 in
  front of it; only the z-extent pokes the lens through the black. Uniform E=0.65 cut the
  visible sclera to 20 px and E ≤ 0.55 rendered **zero** eye pixels at both bearings — the band
  swallows the lens. Lens-plane scaling leaves the crossing depth bit-identical.
- **Re-cutting sclera albedo/value** — collides with the shipped bloom (`6f1d1f4`) +
  scleraTint pair, and §2 measures the value defect already gone. Closed.
- **Scaling the annulus with the eye** — erases the mask area the fix exists to recover and
  shrinks the temple sweep (`_buildMask`'s own note: the part that survives at `hero`'s 111 px).
  Closed.
- **Re-fitting the band `half` profile** — the band already encloses the eye with ~20% margin
  by its own arithmetic; a smaller eye strictly increases the margin. No edit needed; touching
  it would be a second treatment.
- **`eyedark` (pupil widened 1.35× at E=0.45), the dark-dominant canon-eye variant** —
  projected and RECORDED as the fallback if the frame says a small white-ringed eye still reads
  hollow: at closeup it collapses the far eye's pale ring asymmetrically (scl bbox 14×15 vs the
  near eye's 27×23, scl:face 0.052 vs 0.099). Not the registered candidate; a future prereg if
  needed.

## 4. Instrument

`progress/records/eyesize-proj.mjs` (committed, this task) — adapted from `capbill-proj.mjs`
(same stub engine, CPU skin + scan-convert; `shotsil.mjs` caveats inherited: authored pose, no
level occlusion, no shader, **no ink hull**, no PostFX — read for shape; the frame rules). It
applies the candidate to the built bind geometry (equivalence to the §1 edit is exact — header
derivation), renders the two real shot cameras (bearing AND elevation AND pose — `combat` is
scored in `cane_combo_3`) on a 420×420 head-focus crop **frame-locked to the base arm**, and
reports per arm × bearing: sclera/unit bboxes and eye:face on the cheek basis, divider gap +
its ink coverage, outboard strip, band margins above/below each unit, longest eye-row
ink-family run, longest single-row sclera run (the geometric amber bound), glint px. Sides are
**anatomical** (`hisL` = `pupilL`); both cameras sit on his left, so hisL is the SCREEN-RIGHT
eye = CHAR-sbs1's "R disc" (634,139,685,215) and hisR the screen-left "L disc" — stated so no
§11 label flip can travel into scoring.

**Controls, run and passed before this file was written** (`eyesize/eyesize-proj.json`):
- **Zero:** E=1 through the same code path vs pristine raster = **0 differing px**, exact.
- **Monotone:** visible sclera width strictly increasing in E — closeup both eyes, combat near
  eye — **true**. (A number that cannot fail is not a measurement.)
- **Known-bad separation:** `eyebead15` (E=0.15) reads unit:face **0.033/0.035 < 0.06** with a
  4–8 px pale remnant — the beady-eyes failure is visible to the same numbers that pass the
  candidate, so the instrument has a scale (§13/§141.1).
- **Calibration:** base projects unit:face **hisL 0.278 ↔ frame screen-right 0.375; hisR
  0.260 ↔ frame screen-left 0.324** — same order, low-side as expected: the raster has no
  ~2.5 px ink ring (the frame bboxes are outer-dark-rim) and its own cheek-span basis. Definition gaps stated; all
  predictions below are therefore **frame-anchored** (arm-A measured value × the projection's
  arm/base ratio), with the raster→frame scale recorded: closeup ×0.566 (289.6/511.4 px/m),
  combat ×0.325 (168.3/518.0 px/m).

## 5. The projection (the argument the capture is being asked to confirm)

Ladder at `sly-closeup` 33.2° (raster px on the locked 420 crop; unit = sclera∪pupil∪glint):

| arm | E | unit w hisL/hisR | unit:face | divider (ink%) | strip hisL/hisR | scl run | band below | glint px |
|---|---|---|---|---|---|---|---|---|
| base | 1.00 | 76 / 71 | 0.278 / 0.260 | 17 (100%) | 9 / 2 | 71 / 46 | 32 / 19 | 129 / 122 |
| e65 | 0.65 | 44 / 39 | 0.162 / 0.154 | 48 (100%) | 22 / 14 | 42 / 28 | 58 / 47 | 53 / 55 |
| **e55** | **0.55** | **34 / 31** | **0.125 / 0.122** | **55 (100%)** | **28 / 18** | **33 / 23** | **63 / 50** | **49 / 52** |
| e45 | 0.45 | 27 / 24 | 0.098 / 0.094 | 60 (100%) | 32 / 22 | 26 / 18 | 67 / 54 | 49 / 55 |
| e38 | 0.38 | 22 / 20 | 0.080 / 0.077 | 64 (100%) | 35 / 25 | 21 / 15 | 70 / 59 | 50 / 59 |
| bead15 | 0.15 | 9 / 9 | 0.033 / 0.035 | 74 (100%) | 45 / 31 | 7 / 5 | 78 / 63 | 61 / 65 |

At `combat` 44.9° / `cane_combo_3`: base near-eye (hisL) 82 px → e55 **33 px** (0.095 of face);
the far eye is 15 px at base (0.066) and **vanishes at E ≤ 0.55** — declared as an accepted
consequence (it is ~5 real px today; the canon comparand carries no resolvable far eye at this
bearing either). Divider gates are therefore **closeup-only**.

**Why 0.55 and not deeper:** e55 is the arm whose frame-anchored predictions centre the canon
band — pale-aperture eye:face **≈ 0.135–0.141** both eyes (0.324×31/71 = 0.141 screen-left;
0.301×34/76 = 0.135 screen-right; the direct raster mapping gives 0.122–0.125) and aperture
height ≈ 16–18 %hh against canon's 16.7 — while keeping a **10–11 px near-eye at `combat`**
(33 raster × 0.325). e45 lands 0.09–0.11, at/below canon's floor and ~8 px at combat: the
"legible white shape inside the black band or nothing at all" line (`_buildEye`'s own note)
argues against spending the whole canon margin in one step. e65 (0.15–0.18, above canon) is the
value-shopping direction §7's rule forbids after the fact. The eye-row ink-run signature flips
exactly as CHAR-sbs1 §5.2 requires: base runs 58/45 raster (≈ our measured 27–28 px pupil runs,
< 1× unit width); e55 runs **115/100 raster ≈ 65/57 frame px ≥ 2× the new unit width** — the
longest dark thing at the eye rows becomes the band, not a pupil.

**Glint floor (gE = 0.62):** at E=0.55 the glint keeps ≈ 49/52 raster px (frame ≈ today's
16/22 px ≥L228 scaled by ~0.4) — the "alive" cue and the frame's genuine >L228 source survive;
scaling the glint with E would put its core under the ~2.5 px ink ring.

## 6. Registered gates for the capture (bands, not points — §133.1; thresholds stated — §122.1)

Arms in ONE boot, one lock hold (§163 chunked; §165: coordinator-ticketed window):
**A** = base, **B** = `eyesize55`, **KB** = `eyebead15`, **BACK** = base again; shots
`sly-closeup` + `combat` per arm, 1280×720 `--q high`, quality set once at boot and never
toggled mid-chunk (§15's second-rebuild corruption). Arms toggle via `globalThis.__CHAR_AB`
injected before module load per navigation (`charABRaw` reads globalThis before
`import.meta.env` — `SlyModel.js:65`), so §124.4 does not bind (per-arm navigation,
`tuftbias.mjs` harness pattern: `srcAtArm`/`srcAfterArm`, `armsByTree`, tree-quiet settle).
Frames committed per chunk; scored at first wake after DONE (§163.2). **GATE 0 before boot:**
`occlude.mjs` with `globalThis.__CHAR_AB='eyesize55'` then `'eyebead15'` — both sclera rays
CLEAR each time or the arm is abandoned unrun (the outward geometry is untouched by
construction, so a failure here means the token wired more than §1 claims — VOID, fix wiring).

Scorer: a records scorer implementing exactly these definitions, committed with the run before
scoring. Basis: luma = Rec.709; **pale aperture** = px with L>120 inside the per-eye ROI;
per-eye ROI = arm-A's measured disc bbox padded +6 px (B/KB apertures shrink toward unchanged
centres, so A's boxes contain them by construction); eye rows = each arm's own aperture
centroid row (A anchors: y165 screen-left / y171 screen-right, ±6 tolerance); face width =
CHAR-sbs1's cheek basis (A anchor 136 px, x564–x700); dark = L<55; amber = CRITIC's exact
classifier.

**Scoreability first (§141):** arm A must reproduce its own committed record — pale-aperture
eye:face **0.324 / 0.301 (± 0.03)**, face width 136 ± 6, divider 13 ± 4 px, head box occupied.
Outside any of these = instrument/staging suspect: report UNSCOREABLE, do not score B against
it, do not convert.

- **GATE 1 — eye:face lands the canon-bracketing band.** Per eye on B/closeup: pale-aperture
  bbox width ÷ face ∈ **[0.10, 0.18]** (frame-anchored prediction 0.135–0.141; canon 0.10–0.15
  bracketed; A reads 0.30–0.33). Aperture height ∈ **[10, 21] %hh** (prediction 16–18; canon
  16.7). Aperture area per eye ∈ [80, 400] px (A: 840/1118).
- **GATE 2 — the mask returns as a band, not slivers.** On B/closeup: (a) inter-eye divider —
  longest L<55 run between the two apertures at each eye row — ∈ **[24, 44] px** (predictions:
  31 raster-mapped, ~37 frame-anchored; A: 13); (b) longest L<55 run on each eye row ≥
  **max(40 px, 2× that eye's aperture width)** (A: 27–28 px — pupil-scale, CHAR-sbs1 §5.2's
  refuted-signature; B predicted 57–65 px — band-scale. Length only, deliberately no
  start-position clause: the projection's own e55 run threads INTO the near eye's pupil on one
  row and A's y163 run already crosses 12 px into the divider, so a start/containment clause
  would falsify correct results in both directions — §133.1); (c) divider-centre 8×20 px rect
  remnant:cheek ∈ **[0.32, 0.47]** — *toward* canon 0.256 from A's 0.540, floor-bounded by the
  shipped ink render (≈L37–40 over cheek ≈98): geometry returns the band's WIDTH and coherence;
  value parity with canon is the grade chain's, and this gate must not be converted into a
  PAL/ink albedo edit (its luma is settled at its own site). RECORDED, not gated: the outboard
  dark strip at the screen-left eye's row (projection ink-only 10 px vs A's ~10 px mixed — an
  in-frame L<55 run cannot separate new ink from the shadowed fur already beside it, so the
  number would not depend cleanly on the treatment; the divider carries that evidence instead).
- **GATE 3 — amber is bounded by geometry and the classifier control holds.** B/closeup
  longest amber run within each per-eye ROI ≤ **aperture width + 2 px** (≤ ~21; A: 13/5,
  the returned mask area contributes none — it is dark); head-box
  longest amber run ∈ **[20, 40] px on every arm A/B/KB** (the untreated backdrop run at
  row ~100 — if this tracks the treatment, §2's attribution is wrong: VOID the amber leg).
  Head-box amber COUNT: recorded, never gated (lighting-dependent — CHAR-sbs1 §5.1).
- **GATE 4 — the shipped eye ledger survives (the collision check, re-verified in frame).**
  On B/closeup, inside B's apertures: pale p50 luma within **A's ± 8** (A: 156.2/155.0) and
  pale p50 chroma neutral (max channel spread ≤ 12; A: [158,156,152]); glint per-eye max L ≥
  **A − 6** (A: 233.3/234.1); per-eye ≥L228 area ∈ **[2, 42] px** (A: 16/22 — bloom onset
  `6f1d1f4` state); dark-interior p50 : pale p50 ∈ **[0.10, 0.55]** (R2 iris:sclera 0.434
  inside; A: 0.27/0.19 — darker-than-A is canon-ward, so the floor only guards a void
  interior); muzzle patch (588,205,612,225) and cheek patch (610,220,638,234)
  p50 within A ± 6 (untreated surfaces). Ordering glint > sclera > muzzle > dark must hold on
  both A and B.
- **GATE 5 — no collateral.** ≥ 95% of A↔B differing px (any-channel, ΣRGB ≥ 4 — threshold
  stated per §122.1) inside the head bbox + 25 px pad, both shots (treatment is 1,178 eye
  verts); `tools/headratio.mjs` unchanged to 2 decimals; **§166's registered guard: bill
  ink-boundary at 33° ≥ −19.0 px on BOTH A and B** (expected ≈ −17.5 post-`capYaw`; a read
  below −19.0 on A voids that guard and reopens §166 independently of this prereg — do not
  ship B on a frame where A already fails it); **BACK ≡ A**: same srcTree at both navigations
  AND whole-frame diff (ΣRGB ≥ 4) ≤ 200 px per shot, else §160.4's bound reading — verdict may
  stand ONLY if the A↔BACK residual inside the head bbox is ≤ 50 px on both shots; otherwise
  VOID, re-queue.
- **GATE 6 — the known-bad fails like a known-bad.** KB/closeup must read per-eye aperture
  width ≤ 8 px OR area < 60 px, i.e. eye:face ≤ 0.06 (projection: 0.033–0.035 with a 4–8 px
  remnant), while its GATE 3 backdrop control still passes. If KB passes GATE 1, the
  instruments have no scale — UNSCOREABLE for the whole run, no ship, re-instrument.
- **Combat leg (B):** near-eye aperture present — width ∈ [6, 16] px, area ≥ 20 px (prediction
  10–11 px wide) — and nothing else gated at combat; the far eye's disappearance there is
  declared above, not a failure.

## 7. Falsifiers — revert, not defend

- **GATE 1 fails high** (aperture > 0.18 — shader/hull grew what the projection shrank) or
  **fails low** (< 0.10) → the frame refutes the frame-anchored mapping; revert (token off is
  the shipped state), record RESULT-eyesize as refuted with the table, and do NOT re-tune E
  inside the same window — a different E is a new prereg (capbill's rule: value-shopping after
  the frame is how −18° style overshoots ship).
- **GATE 2 fails** (band does not return: divider < 24 px, or eye-row runs stay pupil-scale
  under 40 px) → CHAR-sbs1 §5.2's "returns automatically" premise is refuted in frame; the
  annulus/band interaction needs its own design, NOT a hasty annulus edit in the same window.
  Revert.
- **GATE 3 backdrop control moves with arms** → §2's attribution wrong, amber leg void; the
  size gates may still score, the "iris value discharged" claim reverts to open.
- **GATE 4 fails** (hierarchy broken, pale goes warm, glint dies) → the geometry change reached
  shading (normal-area/bias interaction) — the exact coupling `Body.js`'s biasNormals note
  warns about; revert and route the measured interaction to the ledger before any retry.
- **GATE 5 fails** → token gated more than the eye unit, or the tree moved: VOID, fix, re-run.
  The §166 bill guard firing on A is §166's own reopen, recorded there, not argued here.
- **GATE 6 fails-to-fail** → no instrument scale; UNSCOREABLE, nothing ships on this run.
- If `sly-closeup`'s staging has drifted (scoreability pre-check fails), report UNSCOREABLE —
  re-registration against the actual frame, never a silent threshold change.

## 8. §17 declaration — this is a LOOK CHANGE, and it is declared as one

This candidate deliberately moves a shipped look (the §7.3-adjacent "huge eyes" reading in
`_buildEye`'s sclera note — a paraphrase; §7.3's actual named identity features are cap, MASK,
tail, cane, and the mask is what the discs are erasing). Nothing here arrives as a correctness
fix. The token keeps the shipped build **byte-identical** until a ship decision; that decision
is the coordinator's, on the frame, against these gates — and the §7.4 blind pair (fresh
comparand fetch, sides randomised, verdict per side before unmasking) is the final arbiter the
gates exist to serve, exactly as §166 shipped `capYaw` citing measured evidence while claiming
no sealed verdict. If outcome A holds, ship shape = fold E into a named TUNE constant (e.g.
`TUNE.eyeScale: 0.55`) read by `_eyeFrame`/`_buildEye`, token retired, RESULT-eyesize records
the table, and §166's bill guard plus GATE 4's hierarchy bands become the standing regression
lines for future closeup captures.

## 9. Outcomes

- **A (gates pass):** ship per §8. CRITIC gap #3 closes as "rest-state size fixed by geometry;
  iris value measured already-discharged by the scleraTint ship (§2)". The §7.4 pair is re-run
  by the next critic pass on a post-ship frame — the gates are necessary, the pair is the bar.
- **B (size lands, mask does not / hierarchy breaks):** revert; the specific broken premise
  (§7) routes to its owner file; the projection tables stand as the measured map of the space.
- **C (size refused by the frame):** the lens-plane mechanism is refuted in the graded frame
  (hull/shader/PostFX ate the projection — shotsil's named gap); with uniform scale, albedo
  re-cut and annulus scale closed by records (§3), eye geometry has no cheap lever left and the
  route is a redesign of the eye/mask assembly — coordinator's call, new prereg.

**This prereg spends zero capture.** One chunked boot (~10 min window, 4 arms × 2 shots — sbs1
timing: ≈15 s closeup + ≈10 s combat per arm after prewarm), queued at the coordinator's
discretion behind the standing queue. Nothing in `src/**` changes until that ticket, and the
token path keeps the shipped build byte-identical either way.

## 10. Files this task wrote (sweep list — no git run by this task)

- `progress/records/PREREG-eyesize.md` (this file)
- `progress/records/eyesize-proj.mjs` (instrument; controls in header, §4)
- `progress/records/eyesize/eyesize-proj.json` (projection output at srcTree `820ace395b9664ae`)
- Scratchpad only, never committed: debug part-colour renders (`eyesize/proj/*.png`), the §2
  amber-attribution one-off (classifier + rects fully restated in §2; frame is the committed
  `sbs1/sly-closeup.png`).

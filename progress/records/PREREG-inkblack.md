# PREREG-inkblack — why the ink line never reaches black, and which of the two ink systems owns it

Registered **before** the candidate capture. Supersedes a VOID run recorded in §5 below.

---

## 1. The defect

Critic 9 D5, measured on `shots/r9`:

| | darkest-decile ink L | frame minimum |
|---|---|---|
| REF-venice | **0.031** | **0.000** |
| every r9 frame | 0.087 – 0.106 | 0.027 – 0.075 |

The critic's own median-ink number is fine (ours 0.12–0.24, reference 0.118). The complaint is
specifically that **the darkest end is lifted ~3x**.

The critic also states a mechanism: *"Cause is almost certainly ordering — the ink is being
fogged/graded rather than composited last."*

---

## 2. What reading the source established, and what it did NOT

There are **two** ink systems, and they are on opposite sides of the tonemap. Any claim about
"the ink" that does not say which one is unfalsifiable.

**HULL ink** — `Outline.js:486`, inverted-hull BackSide geometry, drawn as scene geometry.
`fog: false, toneMapped: false` stops *three's* per-material chunks and nothing else. The hull
writes into the scene buffer, so it goes through the whole of PostFX: exposure 0.95, black lift,
gain, split-tone, saturation 1.30, contrast 1.08 about the pivot, `slyAgX`, `slyLinearToSrgb`.
**The critic's "graded" is CORRECT for this system.**

Its authored colour is `inkSun = 0x1a1210`, `inkShade = 0x161022`, via `new THREE.Color(hex)`,
which under three's colour management is sRGB→linear. Transcribed:

| | sRGB | scene-linear |
|---|---|---|
| `0x1a1210` R | 0.1020 | 0.01033 |
| `0x1a1210` G | 0.0706 | 0.00606 |
| `0x1a1210` B | 0.0627 | 0.00519 |

PostFX's own validated chain table (`src/render/PostFX.js:~605`) puts scene-linear **0.010 at
display L 23.4** with the lift at k=1 and **L 12.3** at k=0; shipped `liftDayScale` is 0.35.
That brackets the measured 0.088–0.116 by the route the critic named.

**CREASE ink** — `PostFX.js:1373`, composited in DISPLAY space after `slyAgX` and after
`slyLinearToSrgb`, i.e. last, clamped `min(ink, c)` so it can only darken.
`uInkStrength = 0.95`, so the composite is `0.95*ink + 0.05*background` — 5% of the lit surface
leaks into every line. It is additionally suppressed where the surface is already dark, by
`line *= smoothstep(0.05, 0.20, lum)`. **The critic's "graded" is WRONG for this system.**

Two further terms act after the ink and were missed on the first reading: `c *= vig`
(`vignette 0.16`) and the FXAA pass. Both can push a composited ink pixel *below* the authored
endpoint, which is why "darker than the ink colour" is not by itself evidence of anything.

**Not established by reading:** which system dominates the measured black point. That is what
this capture is for. Reading the source produced a mechanism story twice today and the first one
was refuted by its own test (§5); the split must be measured, not transcribed.

---

## 3. Instrument

**Definitional ink mask, not a detector.** The VOID run used a ridge detector and could not tell
ink from any dark valley (§5). This run defines the ink as the pixels the ink passes actually
change, which requires no threshold at all:

- **Arm A — shipped.** Both ink systems live.
- **Arm B — crease off.** `postfx.tune.inkStrength = 0`. What remains is hull ink.
- **Arm C — both off.** `inkStrength = 0` **and** the hull suppressed.

Then `inkMask = { p : A(p) != C(p) }` exactly, and `creaseMask = { p : A(p) != B(p) }`,
`hullMask = { p : B(p) != C(p) }`. Frames: all ten of `shots/r9`, same seed, `dt = 0`, one boot,
same resolution. `grain` is already 0.0 so the composite is deterministic per pixel.

**Hull defeat lever — MUST BE VERIFIED BEFORE THE RUN COUNTS.** `inkStrength` is a known-good
lever (used in PostFX.js:123). There is no confirmed in-page lever for the hull. If none exists,
one is added *before* the candidate and its inertness on arm A is proven, or arm C is dropped and
this pre-registration is amended and re-committed before capture — not after.

---

## 4. Arms, calibration and falsifiers

### Calibration (MUST FIRE — a null here voids the run)

A null arm proves repeatability, not sensitivity. Both levers must be shown to MOVE:

- **CAL-1** `|A - B|` must be non-empty on every daylight frame: the crease ink is live.
  If any frame shows zero changed pixels, `inkStrength` is not the lever it is documented to be.
- **CAL-2** `|B - C|` must be non-empty on every frame: the hull ink is live.
- **CAL-3** `inkMask` must cover between 0.5% and 15% of each frame. Outside that band the mask
  is not ink — it is either nothing or the whole picture — and the run is UNSCOREABLE.

### Primary claim, and what would refute it

**CLAIM:** the ink black point is owned by the HULL system, and within it by the authored colour
rather than by the grade's floor.

- **P1** — attribution. Darkest-decile L over `hullMask` in arm B is within **0.010** of
  darkest-decile L over `inkMask` in arm A.
  **F1:** if removing the crease ink moves the darkest decile by **more than 0.010**, the crease
  ink is a material contributor and the "hull dominates" half is refuted.
- **P2** — locus. Re-authoring the hull colour to pure black moves the `hullMask` darkest decile
  down by **>= 0.030 L** (toward the reference's 0.031).
  **F2:** if it moves by **less than 0.010 L**, the wall is the grade chain's own floor and not
  the authored colour, the fix is in the grade, and P2's half of the claim is refuted.
  *(P2 requires a src edit and is a second capture; F2 is registered now so it cannot be moved
  after P1's numbers are seen.)*

### Registered outcomes

`PASS` (both P1 and P2 met) · `SPLIT` (P1 met, P2 refuted — locus is the grade) ·
`FAIL` (P1 refuted) · `VOID` (any calibration arm null) · `UNSCOREABLE` (CAL-3 out of band).

### Not being tested here

The **frame-wide** dark mass — critic 9's "share of frame below L=0.15, ours 1.27–3.64% vs
reference 18.95%". That is the shadow floor (§214.1: `SHADOW_FLOOR x key + fill` puts sandstone
at display L~100 on its own) and it is a lighting-ratio question entangled with the live §269
shadow work. D5 has been read as one defect and is two. This pre-registration covers **only the
ink line's black point**. No number produced here may be quoted about the other half.

Also not in scope: the black lift is already off the hook. `liftDayScale 0.35` landed the
composite's own black floor at **0.66 L** on 2026-08-08 (`790b7e5`), before the r9 frames were
captured on 08-09, so the lift cannot be what is holding the r9 ink at 0.088–0.116.

---

## 5. The VOID run this supersedes — recorded, not deleted

`scratchpad/inkblack.mjs`, run against `shots/r9` before this pre-registration existed. It
claimed the black point was the authored crease-ink endpoint and tested it by solving
`p = (1-t)*bg + t*ink` per channel on ridge-detected pixels, requiring the three channels to
recover the same `t`.

**Outcome: VOID, on its own pre-registered calibration, and refuted on its own primary.**

- **Calibration failed.** On `night.png` the detected "ink" median was **0.117** against a frame
  median of **0.076** — the pixels it found were *brighter* than the frame. The detector was
  finding dark texture valleys, not ink. The calibration was written to fire on exactly this and
  it did.
- **Primary refuted.** Median cross-channel spread in `t` was **0.118** against a registered
  bar of `<= 0.10`, and `t` at p99 ran **1.01–1.34** on eight of ten frames — i.e. pixels darker
  than the authored endpoint at full strength can produce. (Explicable by the vignette and FXAA,
  which act after the ink; but "explicable after the fact" is not the test that was registered.)

Both halves failed, so no number from that run is quoted anywhere in this document as evidence.
The nine frames that passed calibration are **also** discarded: the instrument never established
that what it detected was ink, so passing frames are unsupported by the same argument that
sank `night`.

**The instrument is replaced rather than rescoped.** Dropping `night` and keeping the other nine
would be a post-hoc threshold move (§141.1) — the frame to exclude would have been chosen by
looking at which one failed. The definitional mask in §3 removes the detector entirely, and its
thresholds above are registered before its candidate exists.

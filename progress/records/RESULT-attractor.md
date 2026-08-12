# RESULT-attractor — NEITHER rim, on both shots, to a tenth of a degree; and the run's real yield is the arm that didn't move

Sealed `PREREG-attractor.md` (e8ef6b3). Run 1 voided whole (ADDENDUM-attractor-run1: the swap
restored the boot map as 'raw' after the boot default flipped; CAL-2 closed on all eight pairs).
Run 2 on the repaired, mode-faithful swap (56c99a9), tree `61de3de51735d6dc`, floor 9.

## Outcome

```
hero      base R 0.33   noscreen R 0.33   nosurf R 0.33   norim R 0.33     → NEITHER
interior  base R 0.37   noscreen R 0.35   nosurf R 0.35   norim R 0.35     → NEITHER

swings: hero -3.7° under all four conditions; interior -4.1/-4.0/-4.0/-3.9.
gates: C-DRIFT 0 px both boots · readbacks echo · cov 0.47%/0.31% (≥0.20) · CAL-2 all pairs.
```

Both rim systems are **exonerated**: turning either or both off moves the costume's authored
swing by at most 0.2°. My registered forecast (SCREEN-RIM on both) was wrong — record **2/5**.
The fixed-pixel-band geometry argument was sound; it just indicted the wrong fixed-pixel system.

Also confirmed in passing: R(base) ≈ 0.33–0.37, so §281's attenuation reproduces on the
−11.3° pair (PREMISE-GONE did not fire), and the repaired swap rebuilt §281's mask populations
almost exactly (hero 4303 vs 4354; interior 2811 vs 2816).

## The observation that redirects the hunt: hueA is stationary; hueB does the moving

At mid-range, arm A (raw) reads 227.6–228.3° — where the close-ups put it. Arm B (fix) reads
223.9–224.8° instead of the close-range 218.9°. The attenuation is **asymmetric by texture
content**: whatever mixes in leaves the raw arm's hue in place and drags the corrected arm back
toward it. That acquits every geometry-driven symmetric pass *as a family* — and it demands a
partner whose hue sits at or above the raw costume's ~229°.

## Mip blending: refuted offline, prediction registered first

§281 dismissed mips "by sign"; run 2's asymmetry made them the leading suspect again (mip
chains are per-texture content). `progress/records/miphue.mjs` — prediction written in its
header before first run: *swing attenuates with level, mask dies ~L5* — box-downsamples both
albedos and applies the exact frame statistic per level:

```
L0..L5:  hueA 229.3-229.5°   hueB 218.0-218.2°   swing -11.3° at every level
mask coverage RISES 54.1% → 62.9%; at L6 (8x8) swing -12.1°
```

**Refuted** (forecast record 2/6). The costume is UV-contiguous; minification never dilutes it.

## The accused, next: the ink — both systems of it

What remains that is (a) drawn identically in both arms, (b) fixed *screen* width at every
distance by design (`INK_PX = 2.5`, Outline.js — "the game is INK_PX wide at every distance"),
(c) present indoors, and (d) **coloured 260° dark violet** (`inkShade`/`inkCool = 0x161022`,
the source's own comment: "shadow-side line colour, violet")? The ink. Blending a bright 218°
costume pixel toward a dark 260° violet raises its hue reading by single digits; doing the same
to 229° barely moves it — the observed signature, in both direction and asymmetry. At a
~100 px mid-range character, 1.2–2.5 px ink lines plus their AA fringes plausibly touch half
the mask.

§270's rule: two ink systems (PostFX crease, inverted-hull outline) — attribute by toggle,
never assume. PREREG-attractor §4 registered the eroded-mask split as the NEITHER follow-up;
`PREREG-attractor2.md` deviates to the ink toggle lattice and discloses why: the stationary-hueA
asymmetry and the mip refutation both post-date that registration, and the toggle is the direct
causal test on an instrument this run just validated end-to-end. The eroded-mask split remains
the mandatory fallback if the ink lattice also returns NEITHER.

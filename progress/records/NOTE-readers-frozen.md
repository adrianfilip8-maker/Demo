# NOTE — both readers frozen and proven on known inputs, BEFORE any frame existed

Written while goldonset held the capture lock and `shots/goldonset/` + `shots/creamfix/` were
both still empty. Timestamps and the empty-directory checks are in the session transcript.

## What was frozen

| file | scores | state at freeze |
|---|---|---|
| `goldonset-read.mjs` | PREREG-goldonset F0 / TMASK / F1' / F2' / MECH / DG / TGT / LOOK | `shots/goldonset/` empty |
| `creamfix-read.mjs` | PREREG-creamfix F0 / V1 / V2 / V3 / V4 / V5-reported | `shots/creamfix/` empty |

Both take an env override (`GOLDONSET_DIR` / `CREAMFIX_DIR`) purely so they can be proven on a
known input before real frames land. No threshold, band, ROI or population depends on it.

## Why creamfix needed a reader at all — a correction to its own seal

PREREG-creamfix says "Instruments, frozen already (nothing new to freeze)". That is true of the
**ROI boxes and the verdict statistic**, and false of a **runnable reader**: the frozen
`coolskew-read.mjs` is hardcoded to `shots/cap5/{sly-closeup,sly-key}.png`, has no arm loop, no
temporal mask, no `b-r` print and no night path. It cannot score V1–V4. Freezing that reader
after frames land is precisely what this project forbids, so it was frozen during the wait
instead. The sealed ROIs and bands are transcribed verbatim; nothing was re-tuned.

## Instrument proofs (the §1 rule: prove the diagnostic on a known input first)

**goldonset-read** — run against the goldhalo capture re-labelled to this run's arm names:

- hero temporal diff **120,709 px**, temple **253,717 px** — *exact* matches to
  RESULT-goldhalo's sealed table (120,709 / 253,717). The temporal-mask path is correct.
- F1' 22.1% hero / 5.3% temple against goldhalo's published 22.8% / 4.2% for pure time.
- hero annulus stable n 45,977 (vs 49,974 unmasked) p95 169.9 (vs 170.2 unmasked) — the
  exclusion moves the population in the expected direction and size.
- **It returned a NULL verdict on a known-null input.** The goldhalo arms varied the *gain*,
  which RESULT-goldhalo proved inert; the reader printed "lift <= +1.0 -> the onset formulation
  is not the lever either" rather than manufacturing an effect. A reader that can only print
  "confirmed" is worthless; this one prints the stop-band when the stop-band is true.

**creamfix-read** — run against cap5/bud35 frames re-labelled, identical frames per arm:

- temporal mask 0, all stable diffs 0, V3 PASS on all three fix arms — the degenerate control
  behaves.
- **V1's statistic reproduces the seal's own model.** On the real pre-fix cap5 frame the frozen
  TAIL-LIGHT-SHADOW ROI reads cream **b-r +69**, against PREREG-creamfix's registered model row
  of **+63 at subjW 0** (measured band +35..+57). The ROI and the statistic independently
  recover the sealed base state, which is the one thing that could not be checked by reasoning.

## Declared deltas and scope limits (carried into both RESULTs)

1. **`mats` not `materials`.** RESULT-goldhalo §"Reconstruction deltas" #1 records that the
   goldhalo reader indexed `meta.materials`, crashed, and needed a one-token run copy. Verified
   again on disk this session — the frozen `goldhalo-read.mjs` still throws at :78. Fixed at
   source here, so `goldonset-read` carries that delta at **zero**. (No new defect: the frozen
   original is deliberately preserved for audit and the delta was properly declared.)
2. **goldonset LOOK box.** Centring on the single brightest gilded px landed on a prop overlying
   a mask cell — the mask-noise case the header warns about — so the box is the **median of the
   brightest 1%** of stable gilded px. Proven: the box moved (526,45) -> (188,332) and every
   statistic stayed bit-identical, as a crop-only change must.
3. **creamfix V3 population.** The seal defines off-subject via a charvis bbox ∪ a `vSlySkin`
   prepass. The run captures no prepass, and neither `charvis.mjs` (visibility %) nor
   `charview.mjs` (height only) emits a pixel bbox — `tools/**` is LOCKED so neither can be
   extended. V3 is scored on the **architecture material population**, a direct test of the
   seal's own mechanism ("architecture is bit-identical because vSlySkin = 0") and a *subset* of
   off-subject: it cannot false-positive, but it can miss a leak onto props/terrain/sky/FX. The
   whole-frame stable diff and a 64-px cluster map print beside it so such a leak stays visible.
4. **creamfix night ROI.** The seal names "the charvis bbox"; no such box exists in any frozen
   artefact. Derived blind by projecting a 1.0 x 1.8 x 1.0 m box at night's staged player
   position through night's own camera -> **(697,364)-(784,486)**, 122 px tall. Cross-checks
   against `charview`'s independent **101 px** character height for `night` (the box adds depth
   padding and capsule width, so larger is the expected sign). It is a projection, not an
   occlusion test, so it can contain background px; the luma gate and the median defend it and
   `n` is printed for audit.
5. **Mask provenance.** `sly-closeup`/`night` material masks date from Aug 1 17:39 — an older
   tree than the 9401cc7 capture. Camera staging for both is unchanged (the only Shots.js commit
   since, f4fb95e, is purely additive: it appends `sly-startle` and touches neither shot).
   Geometry may have moved under them, which is a false-positive source for V3 and is why the
   cluster map is mandatory before any nonzero count is called a leak.
6. **goldonset mask camera validity, checked not assumed.** Same f4fb95e reasoning for
   `hero`/`temple`. `src/world/Vegetation.js` did change at 13:44; vegetation is absent from the
   material mask by construction, so it can only ever *occlude* a gilded px (removing signal),
   never manufacture halo lift.

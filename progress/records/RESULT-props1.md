# RESULT-props1 — coinlit VOID-INSTRUMENT (scorer NaN, frames are good); colossus LOOK NOT MET despite 7/7 numeric bars

Run 2 of `props1.mjs` (pid 6205), launched **exclusively** per §318 — the only installing run of
the wave, `cand-colossus.patch` in under the lock (src 9531d250) and **restored EXACT** on exit
(2b5c7c49ad9c4668). 30 frames, 6 shots x {off, non, mon, both, back}. Log `props1-run2.log`.

## (b) coins / lamp discs — VOID-INSTRUMENT, no verdict

`node progress/records/props1/coinlit-score.mjs` returns **NaN on every bar** — `dL NaN
(off NaN -> NaN, n=5026)`, and every P2/P3 protection with it. `n` is non-zero, so the masks
select pixels; the means are NaN, which means `statOf` accumulated undefined samples (an
out-of-bounds or stride-mismatched read in the scorer, not a capture fault). **The 30 frames are
valid 1280x720 captures** — this is a scoring bug, so a re-score costs **zero lock time**.
Classified VOID-INSTRUMENT, NOT a candidate failure: the metal-0.30 / spherified-normal
candidate is **unjudged in either direction**. Handed back to the PROPS lane to fix and re-score
its own instrument against the existing frames.

## (c) colossi — LOOK GATE **NOT MET** (coordinator adjudication), ship blocked

The seal's numeric bars passed 7/7 (infW 2→6, zfSd 0.73→1.16, knee tops 5/5 at y 4.49–4.51 with
the `ledge` collider taken from `bag.knee`, pair L1 0.192 m, −180 triangles). Its LOOK gate is
binding and states the deliverable as *"reads as a seated colossus, not a crate."*

Compared `props1run1/courtyard.off.png` (patch installed) against `shots/r12/courtyard.png`
(pre-sculpt), same framing:
- **Real, visible improvement.** The bases now step forward, dark recesses separate the masses,
  the waist narrows against both neighbours, and a horizontal knee ledge reads clearly on both
  figures where r12 had flat monolithic slabs. The articulation the numbers claimed is genuinely
  in the pixels.
- **But the gestalt does not arrive.** Both masses still read as stepped ARCHITECTURAL volumes:
  there is no legible torso/arm assembly, no lap, and the crown remains a slab. A viewer meeting
  this frame cold would still say "stacked blocks with a headdress" — which is r11/r12's
  complaint almost verbatim.

**Verdict: LOOK NOT MET → the colossus sculpt does not ship**, even though every registered
number improved. This is exactly the case the LOOK gate exists for: profile-inflection counts
and knee heights are necessary for a seated figure and are not sufficient for one. Recorded as a
coordinator adjudication (the lane had already reported and ended); a PROPS re-seal that wants to
overturn it should aim at the missing masses — thigh/lap volume and an arm break in the
silhouette — rather than at more inflections.

## Disposition

Nothing ships from this run. `src` verified restored. Basketvary (11b852c) is unaffected and
stays shipped. Two items return to PROPS: fix the coinlit scorer and re-score the existing
frames (no lock needed); and re-approach the colossi as masses, not as a profile statistic.

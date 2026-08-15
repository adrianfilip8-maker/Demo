# NOTE-rim-space — §336's within-frame control, applied to PREREG-rim's own table, settles the space question without a model

**Written after PREREG-rim was sealed (`cb49dd3`) and before any frame of `progress/records/rim1/`
exists.** It moves **no band**: `M2`'s `0.112` / `0.056`, `M1`'s `0.70`, `M3`'s `1.0` / `3.0` and
the `20.0 L` spike threshold all stand exactly as sealed (§141.1). What it revises is my own
**confidence**, and it says so out loud rather than quietly.

## What I missed

`KNOWN_ISSUES §336` landed at `14db80c`, **before** my seal, and I did not read it before writing
PREREG-rim §3. It refutes the AgX hypothesis for the *shadow-tint* item with an instrument I did
not use and should have:

> *"Both populations coexist at identical display luminance, inside one frame. The display
> transform is a per-pixel function of colour with no shot, surface or spatial input; it cannot
> separate two populations by 130°+ at the same L. The gap was made upstream, in the shader."*

PREREG-rim §3 answers the same question with a **transcription of the whole chain** and a gain
table — which needed a model, needed a stated limitation (AO and bloom are not modelled), and
needed a self-check against §333 that under-predicts by 2×. §336's control needs none of that.
**The cheaper instrument is also the stronger one, and it was already in the tree.**

## The control, on PREREG-rim §1.2's own numbers

`sly-profile` carries **four** registered edges whose `BODY` reference is the same blue costume
at the same level — three of them within **3 bytes** of each other in RGB:

| edge | face | BODY (display rgb) | BODY L | **spike** |
|---|---|---|---|---|
| `sly-profile/torso-front` | KEY | (43.5, 95.5, 171) | 35.28 | **+30.03** |
| `sly-profile/cap-top` | KEY | (44, 94, 172) | 34.82 | **+6.08** |
| `sly-profile/cap-back` | SHADOW | (43.5, 93, 172) | 34.71 | **−6.25** |
| `sly-profile/torso-back` | SHADOW | (37, 88, 168) | 32.69 | **+1.06** |

Same character, same material, same frame, same boot. The three tightest sit inside a **0.57 L**
band and **3 bytes** of RGB. Their rim increments span **36.3 L**.

**The argument, and it needs no model of AgX at all.** The display transform is a pure per-pixel
function of the incoming linear RGB: `PostFX.js:1424-1453` reads `scene`, `uExposure`, `uLift`,
`uGain`, the split-tone, `uSaturation`, `uContrast`, `slyAgX` and `slyLinearToSrgb`, and **not one
of those has a spatial, normal, view or light-direction input.** Two pixels that arrive with the
same linear RGB necessarily leave with the same display RGB. These four references arrive within
3–10 bytes of each other, so the transform treats them identically. **A 36.3 L spread in what the
transform emits at those four places therefore has to have existed before the transform.** The
shadow-side rim is not being crushed on the way to the screen; it is not there to crush.

`hero` says it again on a different material: `chest-front` (KEY, BODY L 37.25) spikes **+28.46**
while `tail-right` (SHADOW, BODY L 35.45) spikes **−0.61** — 1.80 L apart at the base, 29.07 L
apart in the increment.

**Secondary numerical check, from the same transcription PREREG-rim §3 flagged as partial.** Gain
on a fixed linear increment at each of those four bases: **118.9 / 103.5 / 121.7 / 116.0** display
L per unit linear — a ±8% spread. A residual of ±8% is **two orders of magnitude** short of
explaining a 36.3 L difference. The transcription is quoted here only to bound the residual; the
conclusion above does not rest on it.

## What this changes, and what it does not

**It does not change any band, and it does not remove the need for the capture.** The control
proves the *difference* between key-side and shadow-side is made upstream of the transform. It does
**not** say which of the two rim paths makes it, nor how much shadow-side band Path A emits in
absolute terms, nor whether Path B is doing anything on the character. Those are `M1`, `M2` and
`M3`, and only frames answer them.

**It does revise my §10 forecast, and the sealed number stays on the record.**

- Sealed: **`M2` = UPSTREAM, ~60/40.**
- Revised, on this control: **~85/15.** The reason I hedged at 60/40 was that inferring a linear
  quantity by inverting a display measurement through arithmetic is exactly what
  `NOTE-linear-vs-display.md` got wrong by 6× before §333 measured it directly. **This control
  does not do that** — it compares two display measurements *at the same base*, where the
  inversion cancels and no arithmetic survives into the conclusion. The hedge was aimed at a
  weakness this instrument does not have.
- **No credit is claimed for the revision.** The sealed 60/40 is what gets scored; a forecast
  improved after sealing but before frames is worth recording for the next seal's benefit and
  worth nothing to this one.

**The residual way I could still be wrong** is unchanged and is the one registered in §10: if the
capture returns `M2 = DOWNSTREAM` with `M3 = SCREEN-RIM-INERT`, then either the `raw` arm is not
showing what I think it shows, or the four references above are not as matched as their bytes
suggest. Either would be a real finding and I will write it as one.

## One more thing §335 corroborates

PREREG-rim §0 argued the `shots/r12` substitution from first principles because `shots/r13` is
gone. `KNOWN_ISSUES §335` reaches the same place independently — *"`shots/r13/` is not on disk and
was never committed … the g1 lane correctly measured r12 instead, justified by §328's own finding
that every `src` commit between the two captures is an inert mechanism plus a props dedupe"* — and
records the same cost I hit: **it could not reproduce the critic's exact magnitudes either**
(+30 L instead of +50 L on `sly-profile`). PREREG-rim §0's unreproduced `L 20` / `L 29` night pair
is the same phenomenon on a different shot, and §0's decision to record it as unreproduced rather
than fit a definition of `L` to it is what §335's lane also did.

**§335's rule applies to this seal directly:** force-add every completed chunk's frames at capture
time. PREREG-rim §4 already requires it. The reason it is worth restating is that r13 was lost
precisely because someone judged a *critic* capture not to need the protection a *seal* capture
gets — and PREREG-rim §1.2 is now, for the rim item, the only surviving pixel-level record of a
defect the whole r13 queue was routed on.

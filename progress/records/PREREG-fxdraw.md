# PREREG — fxdraw: D12's smear must become a drawn shape, and the thresholds are set before the attribution is read

Registered **before `shots/fxshape/` exists on disk** — the attribution boot is queued on the
capture lock as this is written, and the arms are already sealed in
`progress/records/fxshape.mjs` (committed `d339e63`). Nothing below names which emitter is at
fault, because I do not yet know, and every threshold here is either a **ratio against that
emitter's own baseline** or an **absolute derived from the r9 frame and the reference**, so none
of them can be chosen to suit whichever suspect wins. §141.1 applies from here.

## 0. The claim

Critic 9 D12: *"The slash in `combat.png` is a soft grey smear arcing across a third of the frame
with no graphic edge, no colour and no tapering — it reads as a thumbprint on the lens, and it
also desaturates everything it crosses."*

**Claim.** That smear is the contribution of ONE emitter, and its two measurable properties are
that it is enormous and that it is achromatic. A fix must shrink it and give it chroma **without
deleting it** — an impact frame with no impact effect passes "not a smear" trivially and fails
the shot.

## 1. What is already measured, before any arm

From `shots/r9/combat.png` and the scratchpad reference, both lock-free:

| | ours (`r9/combat.png`) | reference (`sly3-venice`) |
|---|---|---|
| share of frame at L >= 0.70 | **4.58%** (253 blobs) | **0.25%** (239 blobs) |
| largest bright connected component | **8,591 px = 0.93% of frame**, sat 0.324 | **179 px = 0.02%**, sat 0.185 |
| 3rd largest, lying across the hero | 4,690 px = 0.51%, **sat 0.095** | — |
| identifiable VFX chroma | smear peak rgb(201,196,183), **sat 0.089–0.095** | lamp flames 108–116 px at **sat 0.736–0.740** |

And the desaturation D12 names, measured on one material crossed by the band and the same
material above it (left wall, `r9/combat.png`):

| | L | sat |
|---|---|---|
| above the band | 0.277 | **0.211** |
| inside the band | 0.481 | **0.108** |

+0.204 of luminance and **half the chroma**, from an additive near-white sprite laid over a
coloured surface. That is the mechanism, and it is the same one the ledger already recorded and
fixed once for the flame body: *"AgX desaturates hard toward the top of its curve, so a
near-white emitter cannot come out of this grade as anything but white however it is scaled"*
(`Emitters.js`, `PAL.flameBody`). RESULT-fxcluster c3 applied that lesson to `cane_spark` and
`cane_flash` and left one cane emitter on near-white.

**Stated as a gap, not a match**: the reference frame contains **no combat impact**. It is
evidence for how this IP draws a bright effect — compact and saturated — not for how it draws a
slash. Nothing here compares our slash to theirs, because we do not have theirs.

## 2. Instrument

`progress/records/fxshapean.mjs`, over `shots/fxshape/`. A pixel counts as changed at
`|dR| + |dG| + |dB| >= 4` — `fx5an`'s threshold, so the counts are cross-referable to the
fx5/fx8/fx9 pins and would move by ~1.9x if quoted against a different one (§122).

"The emitter's own contribution" = the pixel set that its suppression arm removes relative to
`base`. Its chroma is the mean HSV saturation of those pixels **in `base`**, i.e. of what it
actually put on screen after the grade, not of the colour it was authored with.

## 3. Arms

| arm | what | why |
|---|---|---|
| `base` | shipped tree | the reference point |
| `base2` | repeat of `base`, dt 0, same boot | **VALIDITY.** Must differ from `base` by < 200 changed px, or the boot is VOID and every delta is animation phase (§28) |
| `<suspect>` | the named emitter suppressed | establishes its baseline footprint — the denominator for D1 and D3 |
| `cand` | the candidate parameters installed | scored |
| `cand-off` | the named emitter suppressed **with the candidate installed** | establishes the candidate's own footprint |

## 4. Gates. PASS ships; FAIL and VOID do not (`tools/gate.mjs` tri-state).

Let `F0` = the suspect's footprint in the shipped tree (px), `F1` = the candidate's footprint.

- **D1 — SHRINK.** `F1 <= 0.40 * F0`.
- **D3 — NOT DELETED.** `F1 >= 0.25 * F0`. D1 and D3 together are a two-sided band: the trivial
  way to pass D1 is to turn the emitter off, and an impact frame with no impact effect is not a
  fix. **This is the calibration arm that must fire**: an emitter set to zero must FAIL this run.
- **D2 — CHROMA.** Mean saturation of the candidate's own contribution `>= 0.35`.
  Derived, not chosen: r9 measures the smear at **0.089–0.108**, and the reference's drawn VFX at
  **0.736–0.740**. 0.35 sits deliberately below the reference because our effect has to survive
  AgX + `saturation 1.30` + bloom and I am not promising the reference's chroma — it is a little
  over 3x the current value and less than half the reference's.
- **D4 — THE HERO STOPS BEING VEILED.** Over the character's projected box, the candidate's mean
  luminance lift `<= 0.40 *` the suspect's. The box is derived from the staging arithmetic and
  **not** from looking at a frame: `_stageShot('combat')` puts the player at (0, 0, 28) with the
  camera at (4.6, 2.35, 31.4) aiming (-0.6, 1.5, 27.0) at fov 40, and Sly is 1.80 m; projecting
  a 1.8 m x 1.0 m box at that stand gives the ROI, computed in the scorer from `SHOTS` rather
  than typed in.

VOID conditions, each of which blocks the ship on its own:
- `base` vs `base2` >= 200 changed px.
- The suppression arm removes 0 px — the lever did not bite, so there is no denominator.
- Any gate that does not evaluate to a boolean.

## 5. Falsifiers

- If the attribution shows the smear is **not** one dominant emitter — no single arm accounts for
  more than half the changed pixels of `nocane` — then the claim in §0 is wrong and this
  pre-registration is withdrawn rather than re-scoped.
- If the candidate passes D1–D4 and the impact still does not read as a struck blow, the gates
  were necessary and not sufficient, and that gets written down rather than argued away.
- If shrinking the effect improves D4 only because it moved off the character rather than because
  it got smaller, that is a different fix than the one claimed; D1 and D4 are reported separately
  so the two cannot be conflated.

## 6. Out of scope for this run, deliberately

- **The `temple` god rays.** D12's second sentence is about them, but the critic's own number
  there — "strong enough to take the whole frame's darks to 2.86% below L=0.15" — is a
  black-point measurement, i.e. D5, and D5 has an owner and an in-flight run (`PREREG-inkblack`).
  Touching `shaftGain` in the same window would confound both.
- **`land_ring` and `dive_ring`.** They share the `ring` batch and the PLANAR path, but they are
  ground shockwaves with an UP normal, which is exactly the case the shader's size-clamp
  exemption was written for. Whatever ships here must not move them, and the scorer reports
  their emitters' presence so that claim is checkable rather than asserted.

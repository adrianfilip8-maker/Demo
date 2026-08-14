# RESULT-fxghost2 + RESULT-rimfloor2 — both DO NOT SHIP, and between them they close the §306 ghost question with a measured trade

One shared run (`fxfix1` run 4, 93 frames, 9 shots, no install, all `R` restores 0 px). Scorer
logs `fxghost2-score.log`, `rimfloor2-score.log`. Neither seal ships; nothing in `src` moved.

## fxghost2 — the ghosts ARE killable, but only by thinning the sand itself

Component amplitudes at the off arm: G1 15.92 L, G2 9.24, G3 7.99, G4 6.23, G5 4.45.

```
arm                 G1     G2     G3     G4     G5     dunes sand field
g25 ambGain 0.25   0.87r  0.67r  0.67r  0.57r  0.62r   x0.99  (field intact)
g00 ambGain 0.00   0.83r  0.55r  0.56r  0.41r  0.48r   x1.01  (field intact)
t30 alpha 0.30     0.37r  0.35r  0.32r  0.37r  0.32r   x0.07  (field destroyed)
t18 alpha 0.18     0.21r  0.22r  0.19r  0.23r  0.20r   x0.04  (field destroyed)
```

**The registered §138.4 conflict fired exactly as the seal disclosed it (PF4).** The opacity arms
do kill the discs — t18 takes every component to ~20% of baseline and passes all five GH bars —
but they take the intended sand haze with them: the dunes field sum drops to **4% of base**, and
`F_dunes / F_hero / F_courtyard` fail. The ambient arms preserve the field perfectly (×0.99/×1.01)
and **do not kill the discs**: even at ambGain **0.00**, G1 retains 83% of its amplitude.

**The decomposition is the deliverable**, and it corrects §306's lead in an important way:
```
ambient leg carries  G1 17.5%   G2 45.0%   G3 44.4%   G4 58.6%   G5 52.1%
```
§306 concluded "the discs ride the ambient leg" from a litMix sweep that only moved G1. With the
ambient leg now driven directly to zero, that is true for the **small** components (G4/G5 about
half) and **false for the brightest one**: G1 — the 15.9 L disc that is the actual complaint — is
only 17.5% ambient. **So neither published leg owns G1.** Its remaining ~82% is carried by
something the seal did not isolate: the sprite's own emissive/base colour, or the bloom path
downstream. That is where a successor must aim, and it should aim at **G1 alone** rather than
sweeping five components.

## rimfloor2 — all four arms fail, and the character bars fail with them

`E_dunes / E_night / E_guard / E_kerb` fail on the wall arms (w35/w45); the ball arms (b35/b45)
recover dunes/night/kerb but still fail `E_guard`. Decisively, **`P_slyrim_CU` and `P_slyrim_PR`
fail on ALL FOUR arms**, and `P_lamps` with them: the screen-rim floor cannot be cut off-subject
without taking the character's rim and the night lamp sparkles too. The seal built `P_slyrim`
against a same-frame wall control precisely so it could not be fooled, and it reports the cut is
not separable at these doses. `P_nightbudget` fails at b45 as well.
The vSlySkin 0.55 character contract is intact in HEAD and stays intact — nothing shipped.

## What these two runs settle

1. **The seam-glint route via a screen-rim floor is dead at these doses** — it cannot spare the
   character. §306's s10 decomposition pointed here; the direct test says the lever is too coarse.
2. **The ghost discs have a measured price**: they are removable only by a sand-thinning that
   costs three field bars, so the fix is not a dose choice but a targeting problem — isolate G1's
   real carrier first.
3. Both seals' instruments were valid throughout (restores 0 px on every shot, controls
   discriminating), so these are refutations, not voids.

## Disposition

Nothing ships. `TUNE` untouched for both. Successors: (a) a G1-only attribution — sprite emissive
vs bloom re-feed — before any further ghost dose sweep; (b) for the glints, abandon the screen-rim
floor and revisit only if a subject-excluding formulation exists that the `P_slyrim` control can
certify.

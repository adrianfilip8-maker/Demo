# RESULT-attractor4 — all three terms NULL, and the negative arm names the mechanism: saturated blue shade light crushes albedo hue multiplicatively

Sealed `PREREG-attractor4.md` (da037d3), tree `61de3de51735d6dc`, floor 9, rawscene channel.
Gates: CAL-FULL-RAW −10.8° exact vs −10.8° · readbacks echo on live uniforms · C-DRIFT 0 px
on all three boots · CAL-2/CAL-C green (mid-shot rawscene cov 0.21–0.38 %).

## The lattice

```
              closeup R      hero R           interior R
base           0.96           0.56             0.53
neutfill       1.00           0.58  (+0.02)    0.58  (+0.04)
neutshadow     1.02           0.73  (+0.17)    0.58  (+0.05)
nowarmshade    0.62  (-0.34)  0.37  (-0.19)    0.36  (-0.17)
```

Per §4 (weaker-shot rule): `neutfill` NULL · `neutshadow` NULL (MINOR on hero only) ·
`nowarmshade` NULL. **No owner.** Forecast record: **2/11** — both my primary
(`nowarmshade` MAJOR) and secondary (`neutshadow` MAJOR) were wrong.

## What the negative arm proves

`nowarmshade` did not fail to help — it actively hurt, at every range, in the pre-PostFX
buffer, by intervention: removing the subject's warm-shade lerp dropped R by 0.17–0.34.
Combined with `neutshadow`'s partial recovery, the mechanism reads out directly:

> **A saturated coloured light multiplying an albedo pulls every output hue toward the
> light's hue — crushing the albedo's own hue differences.** The subject's shade-side lights
> are strongly blue (`fillSky` #6fa8d8, `shadowHue` #2a3f66). The bluer and more saturated
> the shade light, the more of the costume's authored swing dies. `subjWarmShade = 0.65`
> already recovers part of it (that is what it measurably does here); greying the shadow
> colour recovers more on `hero`; the key-lit close-ups escape because the warm key barely
> compresses.

So there is no defective term to excise. The compression is the shading model's arithmetic
under coloured shade light, scaled by each framing's shade share (~60–70 % at mid-range).
This also finally squares every prior exoneration: rims, mips, ink, edges, and the tonemap
were never in the multiplication.

## The fix already exists in the codebase, inert

§269 / PREREG-shadowhold built exactly the remedy this mechanism calls for:
**`uShadowHold` — "the shade band derived from the surface's OWN albedo"** — the material
holding its own hue in shade instead of taking the light's. It ships at 0.0 (bit-identical),
parked pending D1's enclosure scoping. **D1's lever and D2's mid-range residue are the same
knob.** The alternative dial, `subjWarmShade`, is a certified creamfix deliverable (V-gates
on the face) and is already doing recovery work at 0.65; raising it trades the face and is
not this arc's call to make unilaterally.

## Next

Read PREREG-shadowhold / RESULT-holdscope before anything else — the hold has its own
history, calibrations, and a parked scoping question. Any activation is a new seal with
creamfix-style protection gates for what shadowHold might disturb (architecture is
supposedly exempt by construction at 0; the seal must verify, not assume). No constant moves
until then.

# PREREG — `sandHigh` guard. **My own named fix (§124.1) is falsified offline, before building it.**

Registered before any code, per the coordinator's two requirements. The headline is that the
requirement to register them is what killed the design: both arms turn out to be measurable on
frames I already have, and they refute the guard I proposed.

## 1. What §124.1 proposed, and why it cannot work

§124.1 named the fix as *"a per-sprite distance/near-plane guard, not a global screen-size
ceiling"*. Three measurements, all offline, all on `shots/fx20/`:

**(a) A near-plane guard already exists and the disc is nowhere near it.** Every batch already
runs `a *= smoothstep(uNearFade.x, uNearFade.y, vViewZ)` with `TUNE.nearFade = [0.28, 0.95]`
(`Particles.js:372`, `:672`, `:1451`). A sprite is fully faded only below **0.28 m** and fully
present past **0.95 m**. From the sprite-size arithmetic the shader itself documents
(`:608–617`, diameter fraction = `sz·P11/d`), the disc at 58×61 px in a 720-high frame implies

    sz = 0.20 m (pool minimum)  ->  d ≈ 3.9–6.6 m
    sz = 0.85 m (pool maximum)  ->  d ≈ 16.7–27.9 m   (fov 60°…38°)

**The disc is 4–28 m away.** It is not a near-plane artefact and never was. Widening `nearFade`
far enough to catch it would reach into the body of the field.

**(b) Size does not separate it either — the largest sprite in frame is the invisible one.**
Connected components of `base − no-sandHigh` on `temple`:

| component | size px | screen box | ΔL |
|---|---|---|---|
| **the disc** | 2803 | **58×61** | **+17.28** |
| blob2 | 2101 | **70×71** | **−0.71** |
| blob3 | 1419 | 51×41 | +2.62 |
| blob4 | 1030 | 33×51 | +3.22 |
| blob5 | 719 | 33×36 | +1.81 |
| blob6 | 644 | 24×51 | +1.66 |

blob2 is **larger on screen than the disc and contributes −0.71 L.** Any screen-size ceiling that
removes the disc removes blob2 first. This is §124's `sandLow` bracket (cap 0.12 → −97.8 % of the
field) reproduced on `sandHigh` at component granularity.

**(c) The discriminator is the BACKDROP, measured on the `no-sandHigh` frame:**

| sprite | backdrop RGB | backdrop luma | backdrop R/B | ΔL |
|---|---|---|---|---|
| **disc** | (13, 49, 95) | **44.6** | **0.13** | **+13.70** |
| blob2 | (153,138,120) | 139.9 | 1.28 | −0.34 |
| blob3 | (81, 77, 80) | 78.1 | 1.02 | +1.78 |
| blob4 | (117,103, 87) | 104.8 | 1.35 | +1.96 |
| blob5 | (84, 88, 96) | 87.4 | 0.87 | +1.15 |
| blob6 | (37, 63, 94) | 59.8 | 0.39 | +0.94 |

The disc sits on the darkest, bluest surface in the frame — the painted star ceiling — and it is
the only sprite over such a surface. **The pool's own documentation predicts exactly this**
(`Emitters.js:624–630`): `sand_haze` sprites are *"sand-coloured alpha sprites over sand-coloured
geometry, so however many of them there are they measure within a few luma of whatever is behind
them."* That invisibility is the design, and it is conditional on a sand-coloured backdrop. The
`temple` ceiling is the one large surface in the level that is neither sand-coloured nor lit like
sand, so the veil acquires contrast there and only there.

> **A field engineered to disappear against sand does not disappear against a blue ceiling.
> The defect is the pairing, not the sprite** — so no property *of the sprite* (distance, screen
> size, alpha) separates the artefact from the field, because the artefact sprite is an ordinary
> member of the field. Both my named fix and the obvious one are refuted by the same table.

Caveat kept: blob6 is also on a blue-ish backdrop (R/B 0.39, luma 59.8) at only +0.94, so backdrop
darkness is necessary but not sufficient — it is smaller (24×51) and probably older/fainter in its
fade cycle. The relationship is strong and monotone-ish, not a law, and is not being fitted.

## 2. The two arms, registered

**Arm A — what the guard must not cost.** `sandHigh`'s legitimate contribution, measured where it
is doing its job. `temple` is an interior and cannot answer this; the exterior shots can.
Baseline to be captured (`fx21`): `base` vs `no-sandHigh` on **`dunes`, `hero`, `courtyard`** —
whole-frame changed px, mean |ΔL|, component-size distribution, and the scattered fraction
(components < 200 px). On `temple` that scattered fraction is **10.1 %** (1390 of 13724 px) and
every non-disc component is |ΔL| ≤ 3.22; the exterior numbers are the ones that define the cost
ceiling, and they do not exist yet.

**Arm B — culling the artefact vs thinning the field.** Now expressible because Arm A's table has
two separable populations:

    ARTEFACT  = a connected component with ΔL >= 8.0 over a backdrop of luma < 60 and R/B < 0.5
    FIELD     = everything else sandHigh contributes

    PASS  the temple disc component falls below ΔL 3.0 (from +17.28)
      AND each exterior shot's total |sandHigh contribution| stays within 15% of its Arm A
          baseline, with its scattered fraction within 15% (relative)
    FAIL  the disc survives, OR any exterior shot loses >15% of the field
    A fix that removes the disc by thinning the field is a FAIL, not a partial success —
    this is the §124 `sandLow` failure mode and it is what this arm exists to catch.

## 3. Candidate fixes, ranked, none implemented yet

Deliberately not chosen before Arm A exists, and none is a sprite-property guard:

1. **Backdrop-conditioned suppression** — the pool already samples scene depth for its soft term;
   sampling scene *colour* to attenuate where the backdrop is not sand-like would target the
   mechanism exactly, and is also the most invasive and the most likely to cost frame time.
2. **Enclosure / zone gate** — suppress an *exterior* haze field where the camera is roofed.
   `Lighting._updateEnclosure` already computes exactly this signal (fraction of sky the camera
   cannot see, graded not binary) but is inert (`encloseStrength` 0) and is LIGHTING's, so this
   is a cross-module ask, not something FX can take unilaterally.
3. **Vertical box / `yOffset` restriction** — cheapest, and the least principled: it would stop
   sprites sitting between the camera and an interior ceiling but would also thin the field
   overhead outdoors, which Arm A is precisely the measurement of.

**Nothing ships until Arm A is measured.** The offline half is done and it removed a design; the
remaining claim — *"the disc is gone and the haze is intact"* — is two-part and only the first
part is countable from what I hold.

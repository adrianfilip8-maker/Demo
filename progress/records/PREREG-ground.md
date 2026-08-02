# PREREG — grounding A/B (critic finding #3, "the character is not grounded")

**Sealed before any value is touched.** Two-sided by construction: `normalBias` exists to
suppress acne, so the acne band is as binding as the contact band. A grounding win bought with
shadow acne is not a win and will be reported as a failure of this test, not a partial success.

## Hypothesis and the number that motivates it

A normal-offset shadow lookup displaces the lookup along the surface normal; on a floor lit at
elevation `e` that displaces the shadow **laterally** by `offset / tan(e)`. At `sly-closeup`'s
c0 (radius 12.8 m, 2048 map → texel 1.25 cm), shipping values give

    normalBias = clamp(1.25 cm × 1.7)      = 2.12 cm  → lateral 5.2 cm   at e = 22°
    + PCF       = 2.4 texels = 3.00 cm      → lateral 12.7 cm  (bias + kernel)

At `sly-closeup`'s scale (~278 px/m, Sly 1.8 m ≈ 500 px) that is **15–35 px** of displacement —
inside the 3–55 px window M12 samples. A contact shadow displaced that far is detached from the
sole, which is what "no measurable contact shadow" looks like.

## Instrument — the critic's own M12, validated, not a probe of my own design

`scratchpad/m12.mjs`, reimplemented from `RESULT-critic5.md` §4.3 and **validated against its
published table before use**: 13-px-wide median-L columns at d = 3,6,10,15,20,30,40,55 px below
the left boot sole, two controls on the same rows. Two parameters were not published and were
*recovered by reproduction*, not assumed:

- sole = **(617, 638)**, the frame-**left** boot: reproduces the published under-boot row to
  **0.12 L** mean abs error, six of eight values exact, rise +2.6 L exact.
- controls at **−95 / −145 px** (to the left): −145 reproduces control B to **0.17 L**; −95
  reproduces control A to 0.72 L *including its distinctive 84.4 outlier at d = 40* (82.5 here),
  a bright fleck that exists nowhere else. +95/+145 land on the other boot and match nothing.

`node m12.mjs --validate` gates every scoring run and exits non-zero on fidelity failure.

**Re-location on the new frames is required and disclosed:** `SlyModel.js` has changed since
critic5, so the sole is re-found on this run's own baseline frame by the same method (crop, eye,
then confirm the baseline column is flat as critic5's was). If the new baseline is *not* flat,
the frame has changed underneath the finding and the A/B is reported as not comparable.

## Staging gate — wired AHEAD of both bands

A flat column is only informative if the subject was actually there and actually casting. Before
either band is read, the probe must confirm, per frame:

    sly_body present, visible, castShadow true, not frustum-culled
    its world position and screen bbox (must overlap the sampled columns)
    the character inside c0's ortho box
    the LIVE normalBias (m) and shadow.radius per cascade — the applied state, recorded not assumed

**If the gate fails, the run reports a staging defect and NO band is scored.** This is the
§11 discipline: a probe that skips a transform reports a confident wrong number, and "no contact
shadow" is exactly the reading a missing caster would produce.

## Band 1 — CONTACT (primary)

`ΔL_contact = median(under[d=3,6,10])_base − median(under[d=3,6,10])_treated`, treated = the
reduced-bias states. Null spread from critic5: the two controls differ by 2.0 L at d = 3 and the
column rises +2.6 L over its whole length, so ~±2 L is noise.

- **CONFIRMED** — `ΔL_contact ≥ 8.0 L` (4× the null spread) **and** both control columns move
  `< 3.0 L`. Peter-panning from normal-offset displacement was a real contributor.
- **FLAT / UPSTREAM** — `|ΔL| < 3.0 L at every d`, including at the `minbias` extreme. Then the
  cause is upstream of my files: character not casting into c0, not in contact (§7 records up to
  15.5 cm residual boot penetration), or floor not receiving. **This is a real and valuable
  outcome and is reported as a finding, not a failure** — it converts a guess into a measurement
  and moves the item to its owner.
- **INCONCLUSIVE** — 3.0 ≤ ΔL < 8.0, or controls move ≥ 3.0 L. Reported as such; no claim.

## Band 2 — ACNE (binding counter-risk)

Scored on the A/B pair itself, so the scene's own texture cancels — no absolute texture
threshold. On the eye-verified lit ROIs, over pixels darkened by more than 12 L
(`base − treated > 12`):

    R1 "litwall"  (950, 60, 300, 380)   large flat SUNLIT masonry — the ideal acne canvas
    R2 "litfloor" (770, 480, 200, 120)  sunlit floor band with one shadow boundary

Both cropped and looked at (`roi-litwall.png` z2, `roi-litfloor2.png` z4) before sealing.

- **PASS** — darkened fraction `< 1.0%` of ROI px, **and** `< 50%` of darkened px lie in
  connected components of ≤ 8 px. The component split is what separates *shadows legitimately
  moving* (coherent, large) from *acne appearing* (speckle, small, scattered over lit faces).
- **FAIL** — either threshold breached. A contact win alongside an acne fail is **not banked**:
  it trades §7.3's contact condition for §7.3's surface condition.

## States captured (one boot, frozen clock, `renderFrame(0)` ×3 per §19)

    base     normalBiasTexels 1.7, c0 radius 2.4    (shipping)
    lowbias  0.5, 1.0                               (the proposed A/B)
    minbias  0.1, 1.0                               (extreme — makes FLAT decisive)
    back     1.7, 2.4 restored                      (control: must equal `base` bit-identically)

`minbias` is included because it is what makes a null result strong: if even a near-zero offset
leaves the column flat, displacement cannot be the cause.

**Latent gap found while writing this, recorded not silently fixed:** the shadow cache's key
covers box/radius/far/mapSize but **not** `normalBias` or `shadow.radius`, so a live bias change
leaves cached cascades stale. It cannot affect the contact band (c0 is never cached —
`shadowCacheFrom: 1`), but it would affect acne ROIs drawn by c1/c2, so the harness calls
`L.invalidateShadowCache()` after every toggle. The production path never mutates these at
runtime; the harness is the only mutator. Fix belongs in the cache key and is not being made
mid-A/B.

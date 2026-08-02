# PREREG — rimstarve: what actually shuts the screen-space rim on `temple` / `interior`

**Sealed before any measurement.** No capture requested; the batch has not drained. Written so
the prediction, the bands and the falsifier all exist before the one unknown is fetched.

Owner: SHADING/POSTFX (`src/render/PostFX.js`). Successor to the thread §20 opened, §24.1
closed for the *surface* term, and the `rimSubjExempt` comment block left explicitly open.

---

## 0. What this is NOT about, stated first because it is the easiest thing here to get wrong

§24.1 measured the **surface** fresnel rim on the character's own skinned mask and found it
**93–99% retained** (`temple` `rimSil` mean 237.4 / median 255). *The character's surface rim is
not starved and this prereg does not re-litigate it.* The subject of this item is the **other**
rim — the screen-space pass in `PostFX.js` — which is a separate term with separate gates. §8's
standing warning applies verbatim: **if you are eliminating "the rim", say which of the two.**

---

## 1. The mechanism, read out of the shipped source (determinate, not hypothesised)

`slyBackStep()` (`PostFX.js:536–600`) builds the screen rim's mask as **two multiplicative
gates**:

```glsl
float rel  = 1.0 / max( 0.35, z0 );                                    // :551
float mask = smoothstep( 0.05, 0.16, ( zMax - z0 ) * rel );            // :563   GATE A — depth step
mask *= mix( 1.0, smoothstep( uRimPlanar.x, uRimPlanar.y, bend ),      // :596   GATE B — planarity
             uRimPlanar.z * ( 1.0 - uRimSubjExempt * subj ) );
```

Two facts follow immediately, and both are arithmetic rather than inference:

- **Gate A is a *relative* depth test.** `rel = 1/z0`, so the quantity thresholded is
  `(z_bg − z0)/z0`. The background must be **≥ 5% further** than the subject for the gate to
  open at all, and **≥ 16% further** to open fully.
- **`rimSubjExempt` reaches Gate B only.** It appears nowhere in the Gate A expression. So the
  subject exemption that was built to rescue the character's screen rim **cannot open Gate A at
  any value, including 1.0.** That is textual, checkable in one grep, and it is the load-bearing
  claim of this prereg.

## 2. Frozen arithmetic (`scratchpad/rimdepth-calc.mjs`, run before this seal)

View-space z of the staged player from `Shots.js` constants, and Gate A's threshold expressed
as the metres of background gap it demands:

| shot | z0 root | z0 head | gap to OPEN (5%) | gap to FULL (16%) |
|---|---|---|---|---|
| `temple` | 12.54 | 12.94 | **0.65 m** | **2.07 m** |
| `interior` | 6.62 | 6.39 | **0.32 m** | **1.02 m** |
| `night` (control) | 13.51 | 13.36 | 0.67 m | 2.14 m |

Scope of that table, stated as the suffix it does not implement (§11): it is the **staged root**
projected from camera constants — no ray cast, no occlusion test, no skinned silhouette. The
head row is a 1.5 m proxy for where the rim actually fires. **`z_bg` is not in it, and z_bg is
the whole question.**

## 3. Why this explains three nulls that were previously unexplained

Each of these was measured, is on the record, and read as a dead end. Gate A being unreachable
by any of them accounts for all three *without* needing a new mechanism:

| lever | measured result | why Gate A explains it |
|---|---|---|
| `rimSubjExempt` / `planaroff` | character moves **±0.4 L** (§24, gate5) | waives Gate B while Gate A stays ≈0 — the product is still ≈0 |
| `planarlo [0.015,0.09,1]` on `interior` | **−1.7 pts** against a required +1.5 (RESULT-task8c) | loosens Gate B's *thresholds*; Gate A untouched |
| `rimMagExempt` | tautological null (§22) | a **surface**-term knob; not in this pass at all |

RESULT-task8c's own sentence — *"the depth ratios, not the thresholds, are what starves the
screen rim here"* — is exactly Gate A, named correctly at the time and never followed up.

## 4. The measurement (post-batch; no capture lock needed if the headless path holds)

Fetch the one unknown, `z_bg` just outside the character's silhouette, on `temple` and
`interior`, with `night` as the control that should PASS:

1. **Preferred, no lock:** headless ray cast against Architecture+Props+Terrain along the rays
   that graze the staged capsule's silhouette (the `keyocc*.mjs` / `keymap.mjs` path §24.5 used).
   Report the distribution of `(z_bg − z0)/z0` around the silhouette, not a single number.
2. **Confirmatory, if and only if a lock is free:** paint `mask` (Gate A alone, then the
   product) straight to the framebuffer **with the tonemap bypassed by control flow**, and
   prove the bypass on a known input first — §1's rule, and the specific way `debugShadow()`
   cost eight dead ends. The A/B is free: `uRimPlanar.z = 0` isolates Gate A exactly.

## 5. Registered bands — these partition the outcome (§26.1)

Statistic: **S = median of `(z_bg − z0)/z0` over silhouette-adjacent pixels**, per shot.

- **S < 0.05 on `temple` AND `interior`** → Gate A is shut, confirmed. The starvation is the
  depth-step test, no subject exemption can reach it, and the fix space is Gate A or nothing.
- **S ∈ [0.05, 0.16)** → Gate A is partially open; starvation is *shared* between the gates and
  the single-cause framing above is **wrong** — say so, and the ±0.4 L null needs another
  explanation.
- **S ≥ 0.16 on either shot** → Gate A is fully open and **this entire prereg is refuted**: the
  screen rim is not being starved by depth on that shot and I have mis-read the pass. Record it
  as a refutation, not as a tuning result.
- **`night` control:** predicted S ≥ 0.16 (he is against open courtyard/sky at 13.4 m). If
  `night` *also* reads S < 0.05, the instrument is measuring something other than background
  depth and **no verdict may be quoted from this run at all** — that is the control's job.

## 6. The falsifier that can kill the item outright, and it is not a number

**Registered before looking:** even if S < 0.05 is confirmed, that establishes only that a term
is off — *not* that the frame is worse for it. §24.1 has the surface rim at 93–99% on the
character in this exact shot. So:

> **LOOK (binding):** open `temple` and `interior` at 3× on the character's silhouette against
> its background. If the silhouette already separates on the surface term alone, then Gate A
> being shut is **a correctly-behaving gate, not a defect**, and the right output of this item
> is a one-paragraph note closing it — not a fix.

This is the §7.3 condition the whole thread exists to serve, and it is judged on the image. A
knob moving the image proves it is connected, not that it is the cause; the converse also
holds — a term measuring zero proves it is off, not that it is missed.

## 7. Acceptance on any fix that does get proposed

Gate A exists because a floor running away from a standing camera clears any silhouette-scale
depth threshold — it is half of the `guard` wall/ground contact line (`PostFX.js:568–573`), the
other half being the surface fresnel. So:

- **Bit-identity on static geometry.** Any Gate A change must leave `hero` paving, `dunes`
  ripples and `guard` contact **bit-identical**, checked as bit-identity rather than asserted —
  the same acceptance `rimSubjExempt` carries, and available for the same reason (subject mask
  is 0 off-subject, so the mix is the identity there).
- **`hero`'s 1,692-px kerb band is out of scope** (§24.3): it is the *surface* term, both gates
  pass it correctly by design, and no `rimPlanar`/`rimCurve` value moves it.
- Any fix ships behind its own pre-registered A/B with character retention predicted first
  (§17's trap), not a knob turned on the strength of one shot.

## 8. What this cannot decide

Whether the shipped look *wants* a screen rim on the character in a close-background shot at
all. That is an art call on §2.1.5, routed to the coordinator, and it is upstream of every
number above.

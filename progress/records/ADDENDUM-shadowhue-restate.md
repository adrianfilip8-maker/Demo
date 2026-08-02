# ADDENDUM — the §41 prediction, re-stated before it is measured

Routed as a possible falsification-in-progress: TEXTURES applied my own break-even and got
**shaded sandstone at hue 18° (warm)** where `temple` measures **214°**.

**It is not a falsification of the mechanism. It is a falsification of the constants the
mechanism was evaluated at — and they are my constants, so this is my error propagating into
another agent's work.** Instrument: `scratchpad/relight.mjs`, which reads the constants **out of
`ToonMaterial.js` by regex** instead of transcribing them. Scope stamp (§11): it computes the
shadow LIGHT and the channel-order product only; everything downstream of `uShadowColor` — the
diffuse's ao/shadowMix weights, haze, AO, bloom, grade, AgX, sRGB — is absent. **It does not
predict a frame hue.**

---

## 1. What was stale

| | shadow light (linear) | G/R | B/max |
|---|---|---|---|
| the model in `PREREG-shadowhue.md` / §41 | `(0.1416, 0.1892, 0.4232)` | **1.336** | 2.237 |
| **live, from source today** | `(0.0961, 0.3131, 0.4966)` | **3.258** | 1.586 |

Both rows are reproduced by `relight.mjs` from `ToonMaterial.js`'s own `_refreshShadowColor`
arithmetic, and **both match the pair §18 already recorded** — which is the validation that this
recomputation is right, since §18 measured them independently and earlier.

Two shipped constants my model did not contain:

- **`shadowBounceMix` is `0.05`, not `0.20`.** My whole two-dimensional lever sweep, and the
  bounceMix ladder in `DERIV-shadowhue-target.md` §5, treat 0.20 as the shipped value. It is the
  *fourth* rung of a ladder that has already been climbed.
- **`shadowTeal = 0.15` exists and my model has no term for it at all** — a turquoise blend
  applied to the tint before the peak cap.

**§18 is the section that records this exact failure, and I am the agent who cited it.** I wrote
"a validation number tells you the model matches its reference; it cannot tell you the reference
is current", sealed a model validated to `maxAbsErr 4.7e-5`, and did not re-read the constants.
The 4.7e-5 was real; it was agreement with a tree that had moved.

---

## 2. What flips

`relight.mjs`, live light, albedo desaturated by `shadowSat −0.35` as the shader does:

```
break-even albedo G/R = 1 / light G/R:     stale 0.749      LIVE 0.307

material                rawG/R  shadG/R  x LIVE   G>=R?   product hue
sandstone light          0.606    0.709   2.312    YES       178
sandstone mid            0.485    0.606   1.975    YES       176
sandstone dark           0.402    0.531   1.731    YES       181
limestone mid            0.810    0.869   2.830    YES       193
TURQUOISE               13.775    2.851   9.290    YES       201
MALACHITE                9.663    2.741   8.931    YES       172
LAPIS                    5.706    2.127   6.929    YES       228
```

- **The break-even is 0.307, not 0.749.** TEXTURES' 0.749 is my stale number, correctly applied.
- **The entire stone family passes**, 1.73–2.31. "The stone cannot survive shade" was an artefact
  of the stale light, not a property of the palette.
- **Shaded sandstone multiplies to ~176–181°, not 18°.** The 18° needs *both* the stale light
  *and* the raw albedo instead of `albShadow`. With the live light and the shader's own
  desaturation, the product sits in the teal-cyan region — and 176° plus the fill, the wash and
  the grade is entirely consistent with `temple`'s measured **214°**.

So the mechanism — *the product sets the channel order on a shaded surface* — is **confirmed**,
and only its verdict moves: day goes from "fails by 19%" to **passes by 97%**.

TEXTURES' regime hypothesis (a hypostyle interior is fill-dominated, so the additive terms set
the hue) is **not needed to explain this gap** and is **not thereby refuted** — it is a separate,
still-open question about term shares. §10's lesson is not to stop at the first sufficient cause;
what makes this one safe to accept is that the suspect instrument was checked *and was itself the
thing that was wrong*, against an independent record.

---

## 3. The prediction, re-stated — and it is no longer the prediction that was made

**Old (§41, PREREG-shadowhue §3):** "the violet is daylight-only, and `night` has always been on
the correct side" — day 0.808 fails, interior 0.837 fails, night 1.003 passes.

**That prediction is dead, and `night` is no longer a test of it.** On the live light *day passes
too*, so the day/night split the prediction was made of does not exist. Measuring `night` first
would now confirm nothing: a pass is what both arms of the old dichotomy predict.

> **This is exactly the trap the ruling warned about.** Had I run `night` first as instructed
> against the old statement, it would almost certainly have come back G ≥ R, and I would have
> reported it as confirming a mechanism it does not test.

**Re-stated, with the falsifiable content it actually has now:**

1. **Shaded stone in a fresh daylight capture reads `G ≥ R`.** Product 1.975 on sandstone mid, a
   97% margin, so this is a sign test with room. **If a fresh daylight frame still shows `R > G`
   on shaded stone, the mechanism is wrong** — or a downstream term inverts it, and §41 bounded
   every downstream stage at ≤12° of hue, which is not enough to flip a sign.
2. **Shaded stone hue lands in `[177°, 237°]`** — the band derived in
   `DERIV-shadowhue-target.md`, i.e. `Δh` from the lit mass in `[150°, 210°]`. `temple` at 214°
   already sits inside it. This is now a *confirmation* to be checked rather than a fix to be
   built.
3. **The discriminating shot is a daylight one, not `night`.** `hero` and `temple` carry the
   claim; `night` is a guard against regression, not evidence for the mechanism.

---

## 4. What this does to the fix that was pre-registered

`DERIV-shadowhue-target.md` §6 pre-registers `shadowBounceMix 0.20 → 0.00` plus
`shadowSat −0.35 → −0.50`. **Do not run it as written.** `bounceMix` is already at 0.05, so that
arm is a 0.05 → 0.00 nudge, not the lever the seal describes, and §5's ladder is stale in the same
way.

**The prior question is now provenance, not tuning.** `DERIV` §4's "shipped fails by 37–45°" rests
on shaded hues of 274 / 282 / 261 measured on `eye1/sly-closeup` and `tx7/hero`. §18 records that
`bounceMix 0.20 → 0.05` and the teal blend shipped **mid-session**, and `temple`'s 214° is
plainly from the other side of that change. So those three numbers are of unknown vintage and
**the shipped state may already meet the derived band in daylight.**

The cheap next step is therefore **not a fix A/B**. It is one fresh daylight capture, scored for
`Δh` against the lit mass in the same frame, with the tree stamp read out of the report before a
single number is quoted (§18's operational twin). If it lands inside `[150°, 210°]` with `G ≥ R`,
there is nothing to fix and the correct action is to close the line, not to tune it.

**The derived band stands unchanged.** It was derived from §2.2's surface intent and from a
measured lit mass; nothing in this addendum touches it. What changed is the *distance the shipped
state sits from it*, and that distance is now unmeasured rather than known to be 37–45°.

---

## 5. RESULT — the prediction was measured, and it holds. The line closes.

Measured on `shots/tx8/` (stamp **`671dd39` dirty:false**), scored by `scratchpad/dhscore.mjs`.
**No capture was taken for this**: the frames already existed, and the question "is the tree they
were rendered on still current for the constants I care about" is a `git log` question.

**Provenance, verified rather than accepted.** `ToonMaterial.js`, `toon.glsl.js` and `Lighting.js`
are *unchanged* between `671dd39` and HEAD, so the `shadowBounceMix 0.05` / `shadowTeal 0.15` pair
re-read in §1 is exactly what these frames rendered with. `PostFX.js` carries only the contact
term, which ships at `contact[1] = 0.0` and is verified bit-identical to base. `Materials.js`
moved at `59e3328`, but that commit is *entirely inside* `glyphWall()`, so it cannot reach an ROI
on bare stone — which is why every ROI below is bare stone, checked in its crop.

| shot | lit stone | shaded stone | Δh | from exact complement | G≥R | verdict |
|---|---|---|---|---|---|---|
| `courtyard` (daylight) | 17.9° | **217.2°** | 160.7 | 19.3° | yes | **PASS** |
| `traversal` (daylight) | 33.2° | **230.8°** | 162.4 | 17.6° | yes | **PASS** |
| `temple` (shaft-lit) | 33.1° | **211.4°** | 178.3 | **1.7°** | yes | **PASS** |
| `interior` (torch-lit) | 24.5° | **226.7°** | 157.7 | 22.3° | yes | **PASS** |

Every shaded mass also lands inside the absolute band **[177°, 237°]** derived in
`DERIV-shadowhue-target.md` §3. Both §3 predictions above are confirmed, on the framings §3 said
would carry the claim.

**`DERIV` §4's "shipped fails by 37–45°" row is now retired as stale**, exactly as §4 of this file
predicted it would be: those 274/282/261 hues predate the `bounceMix` + `shadowTeal` change. The
shipped state does not need a fix, so the pre-registered lever arms are moot and `night` — a
regression guard for a fix that is not happening — does not need re-measuring.

**A defect in the acceptance's own statement, found by applying it.** `DERIV` §4 writes the target
as `Δh ∈ [150°, 210°]`. A *circular* separation cannot exceed 180°, so the upper half of that
interval is unreachable by construction. The operative form is `|180 − Δh| ≤ 30°`, which is what
the fourth column reports and what the ±30° split-complementary tolerance actually meant.

**Three ROIs were rejected before these four survived, and all three were the §11 failure mode** —
a well-behaved statistic about the wrong surface. `interior`'s first lit ROI was a dim clipped
frame corner; its second read a clean 28.4° at concentration 0.993 and was **the torch flame and
its bloom halo**, not stone. `traversal`'s first shade ROI sat on the glyph register — the one
recipe `59e3328` touches. Each was caught by looking at the crop, never by the number.

**Two instrument bugs were found and fixed while scoring, both mine.** The median was a *linear*
median of a circular quantity, so any warm mass straddling 0°/360° reported a hue in the empty
half of the circle — the interior torch floor read "p50 313°" for a plainly orange surface. And a
circular *mean* over a bimodal ROI lands between the modes and describes nothing: the first
interior lit ROI read mean 351.8° against median 31.1°. Both are now guarded — circular median by
rotation, and multimodality by the mean resultant length `R`, with every reported ROI at
`R ≥ 0.964`. `temple`'s shaft caveat was likewise **discharged by measurement, not assumed**:
on-shaft 33.1° against off-shaft 34.0° and 34.3° on the same wall, so the volumetric moves luma
but not hue.

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

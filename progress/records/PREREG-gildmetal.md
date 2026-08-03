# PREREG-gild — should `hieroglyph_gilded` carry a lower metalness than solid metal?

Registered **before** any capture. Offline pre-measurement (`tools/gildrim.mjs`) is complete and
its numbers are quoted below; the frame arm has not been run.

## The question, and why it is not the one I was handed

Routed as: `Architecture.js`'s `metal: r.metal ? 0.85 : 0` is one shared constant behind a
boolean, so `gold_leaf` (solid leaf, spec 0.95, rough 0.22) and `hieroglyph_gilded` (leaf over
gesso over limestone, spec 0.55, rough 0.55) are indistinguishable in metal *amount* even though
the recipes carefully distinguish everything else.

The routing came with a framing I am recording so it can be scored against: *"the multiply's
effect is entirely conditional on rim/spec/env being present"*, and therefore measure **the rim
share of the gild mask** first, because a small rim share means metalness may not be a lever.

**That framing is wrong in one structural respect and I am registering the correction before
measuring, not after.** `uRim` is set at `Architecture.js`'s call site as
`TUNE.rimStrength * (r.metal ? 1.15 : 1.0)` — from the **boolean**, not from the metal amount.
`slyMetal` never reaches the rim term in `TOON_SHADE`. So **rim is not a metalness consumer at
all**: changing the value from 0.85 to anything else non-zero leaves the rim term bit-identical
by construction. The rim share is worth measuring — it is quoted below — but it cannot decide
this question either way.

The actual consumers of `slyMetal`, all four of them, and the population each acts on:

| term | expression | chroma? | population |
|---|---|---|---|
| diffuse | `diff *= mix(1.0, 0.20, slyMetal)` | **no** — scalar on a vec3 (§132) | 100% of mask |
| spec amount | `specAmt *= mix(1.0, 3.4, slyMetal)` | no | ≤ 4.9% of gild px |
| spec tint | `specTint = mix(uSpecColor, alb*2+uSpecColor*.25, slyMetal)` | **yes** | ≤ 4.9% of gild px |
| metal env | `metalEnv = alb*env*(slyMetal*uMetalGain*ef)*…` | **yes** | **100% of mask** |

## Offline pre-measurement (`tools/gildrim.mjs`, hero, 1280×720, no lock)

CPU rasterisation of the headless build through hero's camera, reproducing the shader's own
arithmetic including GPU dFdx/dFdy semantics for the silhouette gate.

```
arch:hieroglyph_gilded   273,954 px = 29.7% of frame
  rim term > 0.001 ....... 6.3%      (strong, >0.10: 4.2%)
  spec fires (upper bd) .. 4.9%      — `sh` unknown offline, so this is a ceiling
  metalEnv `ef` .......... 100%, mean 0.382
  mean N·V 0.581, mean slyTurn 40.3
  mask-weighted population ≈ 30,135 px = 3.3% of frame  (ORM blue = 11.0% of texels)
```

**Validation of the instrument:** KNOWN_ISSUES §8 independently records this recipe as *28.7% of
`hero`*. I measure 29.7% from geometry the other measurement did not use. Agreement to 1 pp is
the reason I am willing to quote the other columns.

So the rim share is small (6.3%) — but it is irrelevant (rim is not on the metal path), and the
population that metalness *does* move is **100% of the gild mask**, through `diff` and `metalEnv`.
Metalness is therefore a live lever on ~3.3% of hero's pixels. The pre-measurement does **not**
support "metalness is not the lever either"; it relocates the lever from rim/spec to env/diffuse.

## Pre-registered predictions

Arm: `hieroglyph_gilded` metal **0.85 → 0.45**, poked live on `uMetal` of the material named
`arch:hieroglyph_gilded` in a single boot. Nothing else changes.

Arithmetic, fixed in advance:
- diffuse multiplier `mix(1,0.20,m)`: 0.320 → 0.640 — **+100% diffuse**
- `specAmt` multiplier `mix(1,3.4,m)`: 3.04 → 2.08 — **−32% spec**
- `metalEnv` linear in `slyMetal`: **−47% env**
- rim: **0.000% change** (structural)

**P1 (magnitude).** Gild-mask pixels get brighter and warmer: mean R−B rises, mean saturation
rises. Driven by the diffuse restore, which is ×albedo and the albedo is `0xdcae5e`.

**P2 (the trade — this is the real content).** The same change *reduces* the metal read: the
stylised reflection that `metalEnv`'s own comment says is the difference between gold and "a
yellow ball with a dot on it" drops 47%, and the specular lobe drops 32%. So P1 and P2 point in
opposite art directions and the honest result is a **trade, not a win**.

**P3 (control — hard bit-identity, not a tolerance).** `arch:gold_leaf`, `arch:bronze_dark`,
`props_gold`, `props_bronze` and Sly's cane must be **pixel-identical** between arms. This is
available only because the change is per-recipe, and it is the check that catches the failure
mode where "fixing gold" moves a constant shared with the one object that already reads
correctly. Structural argument: `SlyModel` binarises to `spec.metal ? 1 : 0` in another module,
and `Props` declares its own recipes — neither reads `Architecture.RECIPES`. Verified, not
assumed, by pixel diff.

**P4 (scope).** Total changed pixels between arms must be ⊆ the `hieroglyph_gilded` ROI measured
offline. Any changed pixel outside it falsifies the per-recipe claim.

## What would make me report "not the lever"

If P1's chroma movement over the mask population is under ~2 L / 2 units of R−B at the display,
i.e. lost inside the AgX shoulder the way TEXTURES' `uSpec` sweep was (`Materials.js:257` —
0.55/0.85/0.95 produced L 187.9 / 200.6 / 203.9 and **0 px** over L 235). That precedent is
directly relevant: the shoulder already ate a much larger specular change on this exact
material, and `metalEnv` is a smaller term than `spec` on 100% rather than 5% of the population.

## Carried caution (§132.1)

The paving-vs-gold gap is not purely `metal`. `PostFX.js:94` measured a cool scene-linear add
landing `+3R/+73G/+105B` on warm stone because R sits on the AgX shoulder; `metal` is a **3.1×
amplifier** of that asymmetry, not an independent cause. A metalness arm can therefore improve
gold without closing the gap. **That is registered in advance as a legitimate partial result**,
not a failure.

## Amendment, registered BEFORE the arms were scored

Working through `metalEnv`'s own arithmetic while the capture queued, I found a hole in P1's
confidence and I am recording it here rather than after the numbers land.

`env = mix(uBounceColor, uSkyColor, floor(up*3+0.5)/3)` with `up = smoothstep(-0.25,0.65,R.y)`.
For the **vertical** faces of the kiosk lintel — which the offline mask shows is most of hero's
gild — the reflection vector is near-horizontal, so `up ≈ 0.14`, `floor(0.92)/3 = 0`, and env
resolves to **`uBounceColor`, the warm sand bounce**, not the cool sky. Only the up-facing
lintel tops land on `uSkyColor`.

So lowering metalness *reduces a warm additive* (`metalEnv`) at the same time as it *increases a
warm multiplicative* (`diff`). **The two moves oppose each other in chroma**, and P1's predicted
direction ("warmer, more saturated") is therefore not safe on arithmetic alone — it depends on
which term is larger over the population. P1 stands as written so it can be scored, but I no
longer hold it at the confidence the section above implies, and a null or a reversal on P1 should
be read as this amendment being right rather than as the instrument failing.

P2, P3 and P4 are unaffected.

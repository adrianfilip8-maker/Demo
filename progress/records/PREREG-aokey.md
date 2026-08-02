# PREREG aokey — routing occlusion into the key term, sized before it spends a lock

Sealed before capture. Task #23's window is open: **nothing is applied.** `uAoKey` already
exists as a live uniform defaulting to 0 (`toon.glsl.js:396-402`, `:420`), so both arms are
pokes and neither needs a src edit. Instrument: `scratchpad/aokey.mjs`. Tree `528ee54`, clean.

## Mechanism (not a hypothesis — `ao` is textually absent from the key term)

```glsl
vec3 diff = alb * keyRad * key * mix( 1.0, ao, uAoKey )   // uAoKey = 0 today
          + albAmb  * fill        * ao
          + albShadow * shadow * shadowMix * mix( 0.55, 1.0, ao )
          + shadow * uShadowWash * shadowMix * ao;
```

Occlusion is spent only on terms the sun drowns. `hieroglyph_gilded` authors AO
p5/p50/p95 = **0.247 / 0.412 / 0.992** and renders with a frame AO median of **0.992**. This is
the concrete mechanism behind §7.3's "gold doesn't read as metal (needs hard spec + bloom + dark
occlusion)", and after goldonset's void it is the live gold lever rather than bloom.

A second, independent compression sits in front of it: `ao = mix(1, aoTex, uAoStrength)` with
`uAoStrength = TUNE.bakedAO = 0.55`, which takes the authored **4.02:1** AO span to **1.70:1**
(0.586 … 0.996) before the shader multiplies anything by it. So this is a **two-knob** question
and treating it as one knob will under-deliver and read as a dead lever.

## Closed-form sizing (anchored on the same validated pair as rimwarm)

The model reproduces the shipped state as a consistency check it was not fitted to: it returns a
lit-gild value span of **1.336:1** against TEXTURES' frozen in-frame **1.34:1**.

Lit gild, `uAoKey` 0 → 1, at three plausible key shares of the pixel (ΔL, display):

| pct | aoTex | ao | shipped | share .70 | share .85 | share .95 |
|---|---|---|---|---|---|---|
| p5 | 0.247 | 0.586 | 199,159,88 | **−17.6** | **−21.6** | **−24.7** |
| p50 | 0.412 | 0.677 | 220,183,117 | −11.0 | −14.1 | −16.7 |
| p95 | 0.992 | 0.996 | 242,215,162 | 0.0 | −0.3 | −0.3 |

Value span of the lit gild (p95:p5), against an authored **2.10:1**:

| | span |
|---|---|
| shipped (`uAoKey` 0) | 1.336:1 |
| `uAoKey` 1, key share .70 / .85 / .95 | 1.499 / 1.539 / **1.574**:1 |
| `uAoKey` 1 + `bakedAO` 0.70 / 0.85 / 1.00 (share .85) | 1.632 / 1.765 / **1.955**:1 |

**Verdict from arithmetic: `uAoKey` alone is REAL and PARTIAL** — it recovers roughly 30–40% of
the missing span and leaves gold at 1.50–1.57:1 against 2.10:1. The unoccluded gild is untouched
(0 to −0.3 L), which is the right shape: this darkens crevices, not highlights. Reaching the
authored span needs `bakedAO` to come up with it.

> **Weight this the way task #19 taught us to.** The same class of offline model sized
> `fillSkyMix` at 7–14° of a 10–30° residual and called it "REAL and INSUFFICIENT"; measured in
> frame it delivered **2–4× that**. This model omits bloom, and gold is the brightest thing in
> frame and does feed the bright pass — a darkened gild loses bloom too, which biases the
> prediction **low**. Expect the frame to beat these numbers, and do not use "the model said
> partial" as grounds to skip the capture or to reach straight for `bakedAO 1.0`.

## The A/B, pre-registered

One boot, clock-pinned `step(n, 0)`, shots `hero` (gild is 28.7% of frame) + `interior`.
Arms: `k0` (shipping) · `k1` (`uAoKey` 1) · `k1b55` … `k1b85` (`uAoKey` 1 with `bakedAO` 0.70 /
0.85) · `k0b` (pin control, last).

- **PREDICTION.** `hero` gilded-mask AO-equivalent median moves off 0.992 toward 0.412; lit-gild
  value span rises from 1.34:1 to **1.50–1.60:1** at `uAoKey` 1 and to **1.70–1.85:1** at
  `bakedAO` 0.85; unoccluded gild moves < 1 L.
- **THE GUARD THAT DECIDES THIS, and it is not a gold metric.** `uAoKey` darkens every crevice
  in every sunlit surface in the game — the shader's own comment says so. Whole-frame midtone
  L p50 must not fall by more than **3 L** on either shot, and shadowed architecture must not
  move at all (it is already `ao`-multiplied on all three ambient legs, so a change there means
  the poke did something other than what it says).
- **FALSIFIER.** If the gilded span does not reach 1.45:1 at `uAoKey` 1, the key term is not
  where the occlusion went and the `bakedAO` leg should not be run — go back to the frame AO
  median and find what is holding it at 0.992.
- **NULL CONTROL.** `k0` vs `k0b` bit-identical, or the run is void.

## Not part of this

`shots/rim2/hero-aokey.png` exists and predates this seal. It came from an **unpinned** runner
(`rimsweep2.mjs`, `step(1)` at default dt — see PREREG-rimwarm), so it is not the A leg of
anything and no number is taken from it here.

# PREREG-subjhold — the subject holds its own hue in shade: §269's machinery, §287's mechanism, subjWarmShade's scope

Sealed **before** the shader change exists and before any capture. `shots/subjhold/` does not
exist; `subjShadowHold` does not appear in `src/` at the time of writing.

## 1. The candidate

§287: the costume's mid-range violet is saturated blue shade light crushing albedo hue
multiplicatively. §269 built the remedy — `uShadowHold`, a pure hue lever (the held band is
luminance-renormalised; G3 protected by construction) — and holdscope's enclosure scoping
failed for architecture. The subject needs no enclosure: `vSlySkin` (the `subjWarmShade`
scope: skinned draws — Sly and the guards) removes every reason the hold shipped inert.

> **Shader:** the hold amount becomes
> `clamp( max( uShadowHold, uSubjShadowHold * vSlySkin ), 0.0, 1.0 ) * smoothstep( 0.0, knee, albChroma )`
> with `uSubjShadowHold` published per frame from `TUNE.subjShadowHold` (the `uSubjWarmShade`
> pattern, ToonMaterial ~1460). **Default 0.0** — `max(0, 0·x) = 0`, bit-identical by
> arithmetic. **Candidate value 1.0**: in shade the subject's band carries its own albedo hue
> (the reference behaviour — sly3-venice holds Sly's shirt hue and drops sat/value,
> PREREG-shadowhold §4).
>
> **Not claimed:** D1. Architecture stays unheld; dunes/hero ROI Δh are untouched by scope.

## 2. Boots and conditions (floor 9; the run-4 instrument; mode-faithful swap)

| boot | conditions (each an A-raw/B-fix pair) | purpose |
|---|---|---|
| `sly-closeup` | base, hold(=1) | PROT-CLOSE + PROT-FACE + CAL-FULL |
| `hero` | base, hold, **hold+neutralFill=1** (diagnostic, REPORT-ONLY, never ships) | P2-MID + fill-leg epistasis probe |
| `interior` | base, hold | P2-MID |
| `temple` | base, hold | PROT-ARCH (Sly ≈ 42 px there) |
| `night` | base, hold | PROT-NIGHT |

Pokes: `shading.tune.subjShadowHold` (+ live uniform readback after step); neutralFill poked
both ways for the diagnostic arm only. C-DRIFT per boot (base arm A re-render, 0 px ≥ 9).

## 3. Gates

- **CAL-2 / CAL-C** per costume pair: sha differ; cov ≥ 1.5 % (closeup) / ≥ 0.20 % (mids).
  `temple`/`night` pairs are exempt from CAL-C (their bars are not mask-statistics).
- **CAL-FULL**: composed closeup base swing within ±2.0° of **−9.0°** (bodyhue6, attractor3).
- **CAL-FACE-BASE**: base closeup TAIL-LIGHT-SHADOW `[802,306..862,356] L∈[90,200]` median
  b−r ∈ **[−58, −30]** and TAIL-DARK (same rect + `[820,250..880,300]`, L∈[26,55]) ∈
  **[+5, +45]** (banda's certified bands). Base out of band → the ROI/anchor has drifted →
  **PROT-FACE is VOID-INSTRUMENT** (no ship either way; not a candidate failure).
- **C-READBACK / C-DRIFT** as in attractor4.

## 4. Ship bars — ALL must hold; the verdict is composed-frame, arm B (the shipped texture)

- **P2-MID**: composed hueB(hold) ∈ **213.5° ± 6.0°** (the band, sixth seal) on `hero` AND
  `interior`. (Base reads 223.9° / 224.2° — the candidate must recover ≥ 4.4° / 4.7°.)
- **PROT-CLOSE**: composed hueB(hold) on `sly-closeup` stays ∈ 213.5 ± 6.0.
- **PROT-FACE**: hold-arm TAIL-LIGHT-SHADOW ∈ [−58, −30] AND TAIL-DARK ∈ [+5, +45].
- **PROT-ARCH**: `temple` hold-A vs base-A, pixels with maxChannelDelta ≥ 9: total ≤
  **2,000** AND **zero** in the four 200×200 corner rects — architecture must not see the
  scope.
- **PROT-NIGHT**: `night` hold-A vs base-A changed-pixel population: median display b−r ≥
  **−10** (creamfix V4's retention floor — the subject may hold but must not flip hard-warm
  at night); zero changed px in the four corner rects; **LOOK** — crops written and eyeballed,
  prose verdict binding per §7.1 (a subject reading daylit against the moonlit world is a
  no-ship).

### Outcomes
**SHIP** (all bars): `TUNE.subjShadowHold` default 0.0 → **1.0** in the same commit, with a
test pinning it and `?` no lever needed — the TUNE knob is the lever. · **MECHANISM-ONLY**:
P2-MID missed but both mids move ≥ 2.0° toward the band with protections clean — no ship;
the hero joint arm's number routes the next seal (fill leg vs strength). · **FAIL**: either
mid moves < 2.0°. · **VOID**: any must-fire gate null. The diagnostic arm ships nothing ever.

## 5. The expected outcome, written down in advance

**MECHANISM-ONLY.** The hold re-hues the shadow leg only; attractor4 measured that leg's
grey-out recovering +0.17 R (rawscene) on `hero` and the fill leg's share masked by
epistasis. Composed recovery after PostFX's cut plausibly lands 2–4° of the required 4.4° —
real movement, band missed. A SHIP would mean the wash withdrawal `(1−hold)` and the
re-hueing together outperform the grey-out equivalence — possible, not expected. Ledger
going in: **2/11**.

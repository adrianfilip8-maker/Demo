# PREREG-linchroma — is the costume still blue in LINEAR, before the display transform?

**Lane:** SHADING → possibly POSTFX. **Date sealed:** 2026-08-15.
**Ancestry:** §277 → §312 → lithold (VOID) → litbleach (VOID) → litbleach2 (**valid**, DO NOT SHIP,
§332) → `NOTE-linear-vs-display.md`.

**Status: REGISTERED before any capture.** `progress/records/linchroma1/` does not exist at this
sha. **Frame count: 4** (§329.1), one chunk, plus 2 discarded warm-up renders (§331).

**No `src` change.** Everything this seal needs already exists in `PostFX.debugRaw('scene')`.

## 1. The question, and why it decides a re-route

`litbleach2` measured `subjLitHold` lifting traversal's display saturation by **+0.010** against a
required **+0.215** — a valid run, every gate passed. `lithold-model.mjs` predicts **+0.246** for
the same dose. `NOTE-linear-vs-display.md` ruled out scope dilution (bright half 95.2% subject,
95.2% of it moved), the branch failing to run (KO strict), and the knee (PF_COSTUME 223.3°).

What remains is `loss = 1 − outChroma/albChroma`, computed in **scene-linear**. The model implies
`loss ≈ 0.5`; the capture implies `loss ≈ 0.02`. An effective 0.02 means the pixel is still ~98%
as chromatic as its albedo when the shader hands it off — i.e. **the bleach happens downstream, in
AgX + the grade's `saturation: 1.30`, not in the shader at all.**

That is currently an **inference**. This seal measures it directly.

## 2. Instrument — and it carries its own proof

`PostFX.debugRaw('scene')` presents the **linear HDR scene target, before AO / ink / bloom / grade
/ AgX**, stopping the chain by control flow rather than by zeroed uniforms. Its own documentation
requires the bypass be proven before anything read through it is quoted: `debugTerm(4)` writes
`(0.25, 0.50, 0.75)` and the PNG **must** read `(64, 128, 191)`.

That control does double duty here. `0.25 × 255 = 63.75 ≈ 64` establishes that the buffer is
written **linear and undecoded** — so a pixel's linear value is `byte / 255` and linear chroma is
computable directly, with no sRGB decode to get wrong.

## 3. Arms — 4 frames

| arm | state |
|---|---|
| `off` | normal render, display space — the baseline, and the pixel set every measurement uses |
| `raw` | `debugRaw('scene')`, `debugTerm(0)` — linear scene, pre-tonemap |
| `cal` | `debugRaw('scene')`, `debugTerm(4)` — the bypass control |
| `back` | normal render — the §302 bracket against `off` |

Warm-up: **2 discarded renders after staging** (§331). Shot: `traversal`, rect
`[557, 261, 582, 291]`. The measured pixel set is the **brightest half of the rect taken from the
`off` arm**, so the linear read covers exactly the pixels litbleach2's display number covered.

## 4. VALIDITY — fail-closed, all sealed now

| gate | bar | on failure |
|---|---|---|
| `CAL` | `cal` reads `(64,128,191)` ±1 over ≥ 5% of the frame | **VOID** — the bypass is not a bypass and no number read through it means anything |
| `R` | `diff(off, back) == 0 px` | **VOID** |
| `CLIP` | < 5% of the measured pixels are at 255 in any channel in `raw` | **VOID** — the linear read is clipped and chroma is not recoverable |
| `V_ROWS` | 4 rows | **VOID** |

`CLIP` exists because the scene target is HDR and the blit is 8-bit: anything above linear 1.0
saturates to 255, and a clipped pixel reports chroma 0 for a reason that has nothing to do with
the question. It is a disclosed hazard of this instrument, gated rather than hoped away.

## 5. THE MEASUREMENT AND ITS SEALED BANDS

`linChroma` = mean of `(max−min)/max` over the measured pixels in `raw`, computed on `byte/255`.
`ALB_CHROMA = 0.990` — the costume albedo's linear chroma, measured over 146,505 texels of
`sly_body_fix.png` (PREREG-lithold §0(a); not re-derived here).

| outcome | bar | meaning |
|---|---|---|
| **CONFIRMED** | `linChroma ≥ 0.80 × 0.990 = 0.792` | the pixel leaves the shader essentially fully chromatic. The bleach is produced by the display transform. **§277/§312 re-routes from SHADING to POSTFX.** |
| **REFUTED** | `linChroma ≤ 0.50 × 0.990 = 0.495` | substantial chroma IS lost in linear, so `loss` should have been large and the 25× divergence needs another explanation entirely. |
| **INCONCLUSIVE** | between 0.495 and 0.792 | say so plainly; claim neither. |

## 6. What this seal does NOT do

It proposes **no candidate and no ship.** There is no dose, no `TUNE` change, and no acceptance
bar on a fix. It is a measurement seal: its only product is a number and the route that number
selects. Nothing in `src` moves on any outcome.

## 7. Registered forecast

I expect **CONFIRMED**, at roughly 75/25. The inference chain behind it is tight — three
alternatives eliminated by measurement, and `loss ≈ 0.02` follows from the shader's own arithmetic
given the observed effect. The 25% is the possibility that the divergence lives somewhere I have
not thought of, in which case `linChroma` lands low and I will have been wrong about where three
seals' worth of work should have been aimed.

**If CONFIRMED, the follow-on is NOT a quick grade tweak.** The grade is shared by every shot, so
`saturation` is a whole-look control, not a character fix: any seal touching it needs a blind
critic round as its LOOK gate rather than a rect, and must be scoped as a global change with
protections on the shots that currently read well.

## 8. Disposition rules

- Any validity gate FAIL ⇒ **VOID**, no claim in either direction, diagnose and re-run.
- §141.1 absolute: no band here moves once a frame exists. A re-seal is a NEW file.

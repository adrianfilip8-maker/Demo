# RESULT-dispchroma — DO NOT SHIP. The target was hit for the first time in this arc, and the control was destroyed doing it

Scored against `PREREG-dispchroma.md` (93d9c99). 9 frames, 2 chunks, all force-added. Every
validity and pre-flight gate passed, so this is a real verdict.

```
V_ROWS / V_CHUNKS / V_CHUNK_TREE                                  PASS
R_traversal  0 px  ·  R_sly-key  0 px                             PASS
PF_MASK traversal 81.2% subject                                   PASS
PF_COSTUME traversal 223.3 (dH 9.8) · sly-key 205.4 (dH 8.1)      PASS
PF_STAGE traversal 0.205 <= 0.3 · ctl 0.516 >= 0.42 and >= 2x     PASS
E_S_traversal   on S 0.435 >= 0.42                                PASS
E_H_traversal   on H 223.2  |dH| 9.7 <= 25                        PASS
LUM_traversal   |dL| 0.40 <= 3                                    PASS
KO   off 0.205 < ko 0.337 < on 0.435 (strict)                     PASS
CLIP_traversal  4.8% driven to the gamut wall (want <= 10%)       PASS
PROT_CTL  sly-key on S 0.992 >= 0.42, drift 0.476 <= 0.06         FAIL
PROT_ENV_traversal  8175 px inside mask+3, 8 px BEYOND            FAIL

==> DO NOT SHIP — PROT_CTL FAIL, PROT_ENV_traversal FAIL
```

## 1. My registered forecast was WRONG, and the miss is the useful part

§10 predicted **~70/30 that `CLIP_traversal` would FAIL** at ~13.6% against a 10% bar. It
**passed at 4.8%** — the offline model was pessimistic by nearly 3×.

The seal's §2 disclosed exactly why this could happen: the offline derivation applied the hold to
the **final** frame, whereas the shipped branch runs immediately after the encode, **before** the
silhouette rim, ink, vignette and dither. Those later passes evidently absorb a good deal of what
the naive application drove to the wall. **The caveat earned its place**, and I claim no credit
for a forecast that was both confident and wrong in its headline claim.

What the forecast got right was the *shape* of the risk — it named `PROT_CTL` as the second
likely failure, and that is what fell.

## 2. The target was hit — a first for this arc

`E_S_traversal` **0.435** against a 0.42 bar. Across lithold (VOID), litbleach (VOID) and
litbleach2 (+0.010 against a required +0.215), no seal in this lineage had moved the costume
anywhere near its acceptance bar. This one did, and did it cleanly:

- `E_H` 223.2° — hue held, no per-channel clamp damage
- `LUM` |ΔL| 0.40 — luminance-exact as constructed
- `KO` strictly monotonic, 0.205 → 0.337 → 0.435
- `CLIP` 4.8% — the shading bands largely survive

**§333's re-route is vindicated**: the chroma *is* recoverable, and it is recoverable *after* the
tonemap. That is the load-bearing positive result and it stands independent of the verdict.

## 3. Why it still cannot ship: a fixed-gain amplifier cannot serve two shots at once

`PROT_CTL` did not fail marginally. The control went from **0.516 to 0.992** — drift **0.476**
against a 0.06 bar, i.e. nearly eight times the allowance. sly-key is not bleached; it is one of
the five close-ups the r13 critic measured as *correct*. At `ON = 2.00` the subject mask makes
`s = 3.0` on every character pixel in every shot, so the lever amplifies a shot that is already
right exactly as hard as one that is wrong, and drives it to near-total saturation.

**The mechanism has no notion of how much chroma was lost.** It is a fixed gain scoped by *who*
the pixel is, with nothing scoped by *what happened to it*.

## 4. The synthesis this produces — and it is the most useful thing in the fold

Put the two failures side by side:

| | scope | gate | place | outcome |
|---|---|---|---|---|
| `subjLitHold` | subject | **loss-aware** (`1 − outChroma/albChroma`) | **linear, pre-tonemap** | correctly declined; +0.010 (§332) |
| `dispChromaHold` | subject | **none** (fixed gain) | **display, post-tonemap** | hit the target; destroyed the control |

**`subjLitHold` had the right gate in the wrong place. `dispChromaHold` has the right place with
no gate.** Neither is a failed idea; between them they specify the successor exactly: a
**loss-aware gate evaluated at the post-tonemap site**. The albedo is not available there
(§NOTE-postfx-route), so the loss term cannot be the shader's — but it does not have to be. A
display-space proxy is available: the shot's own subject chroma relative to a reference, or a
per-pixel comparison against the pre-tonemap buffer the composite could sample.

That is a real design, derived from two measured failures rather than invented, and it is the
successor.

## 5. `PROT_ENV` — the leak scales with dose

8 px beyond the dilated mask, against litbleach2's 1 px at a much smaller dose. The leak is
**dose-dependent**, which is itself informative: a fixed mask-edge artefact would not scale. It
points at mask feathering at the silhouette — the bilinear fetch of a full-res mask under a
per-pixel amplifier — rather than at a stray unmasked draw. Still open, now with a second data
point and a direction.

## 6. §9 LOOK — not reached

The seal fails on protection, so no write is in question and the binding LOOK does not gate
anything here. Recorded rather than skipped: `CLIP` at 4.8% is evidence the *dose shot* would
likely have survived the look, but the control at S 0.992 would not have — a costume at
99% saturation is the neon decal §9 was written to catch.

## Disposition

Nothing ships. `dispChromaHold` stays **0.0**.

1. **The post-tonemap site is CONFIRMED as the right place** — E_S, E_H, LUM, KO and CLIP all
   passed there. Do not re-litigate §333's re-route.
2. **A fixed gain is refuted** — not by argument but by a control at 0.992. Do not re-seal
   `dispChromaHold` at a lower dose hoping to spare the control: a dose low enough to leave
   sly-key alone cannot lift traversal, because the same `s` applies to both.
3. **Successor: a loss-aware gate at the post-tonemap site**, per §4. That is the first candidate
   in this arc that is specified by measurement rather than by hypothesis.
4. `PROT_ENV`'s dose-dependent leak stays open, with mask feathering as the leading suspect.

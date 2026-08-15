# RESULT-litbleach2 — DO NOT SHIP. The first VALID run in this lineage, and it refutes both the lever and my own hypothesis

Scored against `PREREG-litbleach2.md` (5a58b50). 9 frames, 2 chunks, all force-added.
**Every validity and pre-flight gate passed**, so unlike lithold (VOID) and litbleach (VOID)
this is a real verdict on the candidate.

```
V_ROWS   9 rows                                                        PASS
V_CHUNKS chunks present [sly-key, traversal]                           PASS
V_CHUNK_TREE  1 src hash across 2 chunks: 2b5c7c49ad9c4668             PASS
R  traversal   off-vs-back 0 px (want 0)                               PASS
R  sly-key     off-vs-back 0 px (want 0)                               PASS
PF_MASK traversal  rect is 81.2% subject (want >= 60%)                 PASS
PF_COSTUME traversal off H 223.3  |dH| 9.8 <= 30                       PASS
PF_COSTUME sly-key   off H 205.4  |dH| 8.1 <= 30                       PASS
PF_STAGE  traversal 0.205 <= 0.3 · ctl 0.516 >= 0.42 and >= 2x         PASS
E_S_traversal on S 0.215 >= 0.42                                       FAIL
E_H_traversal on H 223.0  |dH| 9.5 <= 25                               PASS
LUM_traversal   |dL| 0.09 <= 3                                         PASS
KO  traversal off 0.205 < ko 0.211 < on 0.215 (strict)                 PASS
PROT_CTL  sly-key on S 0.516 >= 0.42, drift 0.001 <= 0.06              PASS
PROT_ENV traversal  3039 px inside mask+3, 1 px BEYOND (want 0)        FAIL

==> DO NOT SHIP — E_S_traversal FAIL, PROT_ENV_traversal FAIL
```

## 1. §331 is CONFIRMED end to end — the instrument is fixed

`R_sly-key` was **1120 px at max delta 21** in litbleach. It is now **0 px**. `R_traversal` holds
at 0 px as before. The cross-validation is exact: `sly-key.off` and `sly-key.back` are both sha
**75991b4ed9a49ab3**, which is the same sha `convprobe` measured for its **converged** state
(r1 through r7, six consecutive bit-exact pairs). Two discarded renders put the capture in
precisely the state the probe predicted.

That is a full cycle: an unsealed calibration probe predicted the fix, a sealed capture reproduced
it, and the bar was never moved to accommodate the problem. **Same-boot 0-px brackets are
achievable on this renderer once the first frame after staging is discarded**, and every future
seal here inherits that.

## 2. The verdict: `subjLitHold` cannot reach the bar at any legal dose

At the sealed dose 0.70 the hold lifts traversal's costume saturation from **0.205 to 0.215** —
**+0.010** against a bar of **0.42**. It needs +0.215 and delivers 4.7% of that.

The lever is not broken and is not switched off:
- `KO` passes **strictly** — 0.205 < 0.211 < 0.215 — so it is a working, monotonic dial.
- `LUM` passes at |dL| 0.09, so it is luminance-exact exactly as its contract claims.
- `E_H` passes at 223.0°, so it does not push the hue anywhere wrong.

It simply has nothing like the authority the defect requires. Linear extrapolation from the KO
point puts the dose needed at roughly **15**, against a uniform clamped to **1.0**. **There is no
legal dose at which this lever reaches its own acceptance bar.** That is a decisive, quantitative
refutation, and it is the first one in this lineage made on a fully valid run.

## 3. My gate hypothesis is REFUTED — and the seal said so in advance

`NOTE-litbleach2-aim.md` argued the hold looked inert in litbleach because a low-albedo-chroma ROI
drives `smoothstep(0, uShadowHoldKnee, albChroma)` to ~0, gating it off. §10 registered the
falsifiable form: *traversal passes `PF_COSTUME`, so its gate should engage; if it still moves
~+0.010 there, the gate hypothesis is refuted.*

**Traversal passed `PF_COSTUME` at 223.3° and still moved +0.010.** The hypothesis is dead. The
ROI is on real costume with real albedo chroma, and the lever engages — `KO`'s strict
monotonicity proves engagement — yet its magnitude is tiny. Nothing about the rect explains it.

**Forecast accounting:** §10 predicted ~50/50 on `E_S_traversal` and it FAILED, so no credit is
claimed. The prediction that mattered was the refutation condition, and it fired.

## 4. Where the defect actually lives — a hypothesis, labelled as one

With the gate ruled out, the remaining term in `slyLitH` is **`loss = 1 − outChroma/albChroma`,
computed in SCENE-LINEAR space**, while the defect is measured in **display space after AgX
tonemap and a grade carrying `saturation: 1.30`**.

If the costume pixel is still reasonably chromatic *in linear*, `loss` is small, the hold
correctly declines to act — and the desaturation the critics see is being produced **downstream,
by the display transform**, not by additive legs inside the shader at all. That would explain
every observation at once: a working, monotonic, correctly-gated lever with almost no effect,
because it is repairing chroma at a stage where little has yet been lost.

This is **not established by this run.** It is the successor's first test: measure the costume
pixel's chroma in linear (a `debugTerm` arm reading pre-tonemap `outgoingLight`) against its
display-space `S`. If linear chroma is high while display `S` is 0.205, the item belongs to
**POSTFX/tonemap-grade** and `subjLitHold` should be abandoned rather than tuned.

## 5. `PROT_ENV` failed by 1 px, and it counts

`PROT_ENV_traversal` reports **1 px** differing beyond the subject mask dilated 3 px, against
3039 px legitimately inside it. PREREG-litbleach §11 disclosed this exact risk before any capture
and committed in writing that a one-pixel failure would be **a real failure blocking the ship**,
precisely so it could not be waved through later as "basically zero". It is recorded as a FAIL.

It does not change the disposition — `E_S_traversal` already blocks — but it is a genuine open
item: the vSlySkin-scoped mix should be incapable of moving an off-subject pixel, so one that
moves indicates either mask edge feathering or a leak worth locating. Routed to the successor.

## Disposition

**Nothing ships.** `TUNE.subjLitHold` stays **0.0**. `TUNE` untouched.

1. **`subjLitHold` is refuted as the fix for the action-shot bleach** — not by a VOID, not by
   inference, but by a valid run where it engaged correctly and moved 4.7% of the required
   distance, with no legal dose able to close the gap. It should not be re-sealed at a higher dose.
2. **Successor:** test §4's linear-vs-display hypothesis first, offline where possible. If linear
   chroma is intact, the whole §277/§312 item re-routes from SHADING to **POSTFX** (tonemap/grade),
   and three seals' worth of shader work on it stops.
3. **Locate the 1-px `PROT_ENV` leak.**
4. **Combat still needs a costume-masked statistic** (NOTE-litbleach2-aim.md addendum) before it
   can be measured at all.
5. §331's warm-up transfers to **every** seal in this repo, including guardcone's AMENDMENT A2.

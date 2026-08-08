# RESULT-grain1 — the grain was concealing most of it, and there is still a real deficit underneath

Run against `PREREG-grain1.md`, sealed before capture. Six arms, one boot, 4,443 s.

## Gates

| gate | outcome |
|---|---|
| **P-F4** armTook | **PASS** — 1, 1, 1, 1, 0, 1 exactly as registered |
| **P-F5** one boot | **PASS** — token `bsk6e9vl4j6e1786165078477` on all six |
| **P-F3** determinism | **PASS** — `restore` reproduces `base` to the digit on all four ROIs, *including its noise floor* (medΔL 1.79 / 1.86 / 1.64 / 1.72 identical) |
| **P-F2** lever reached | **PASS** |
| **P-F6** noise floor fell | **PASS** — mean medΔL 1.75 → 0.93 |
| **P-F1** grain-not-primary | **did not fire** — G1 = 54.35, above the 40 floor |

## The registered bands — a genuinely mixed result

| id | quantity | band | result | |
|---|---|---|---|---|
| **G1** | mean raw FLAT, `g00` | ≥ 60 | **54.35** | **misses** |
| **G2** | mean median ΔL, `g00` | ≤ 0.8 | **0.93** | **misses** (from 1.75) |
| **G3** | frame-wide flat area, `sly-startle` | ≥ 6.0 % | **20.96 %** | **passes, 17× the 1.2 % baseline** |
| **G4** | R4 `courtyard` raw FLAT | ≥ 75 | **57.2** | **misses** |

Per ROI, raw FLAT and median ΔL:

```
R1 sly-startle   base 20.5 (1.79)  ->  g00 63.3 (0.72)
R2 temple        base 21.6 (1.86)  ->  g00 57.1 (0.92)
R3 interior      base 32.0 (1.64)  ->  g00 39.8 (1.36)   <- weakest by far
R4 courtyard     base 25.4 (1.72)  ->  g00 57.2 (0.72)
```

**I registered ≥ 60 as confirmation and got 54.35, so the strong claim is not established.** Mean raw
flatness more than doubled (24.9 → 54.4) and the critic's own headline metric moved 17-fold, but
54 % is not the > 85 % a quantised ramp gives, and `ramp1`'s median-filter prediction of 70–85 %
came in **high**. That inference is recorded as **somewhat overstated** — not refuted (P-F1 did not
fire), but not vindicated at the strength I claimed either.

**The honest two-part conclusion:**

1. **The grain was concealing most of the flat structure.** It supplied a noise floor of 1.75 luma
   against a 1.0 threshold; removing it drops that to 0.93 and roughly triples flatness on three of
   four surfaces.
2. **There is a real shading deficit underneath it.** 54 % is not cel art. The frames agree with the
   numbers: with the grain off, Sly's muzzle is clean but still a **smooth airbrush gradient with no
   hard step**. Critic defect 1 is *not* closed by this change, exactly as the seal said a pass
   would not license.

### `interior` is a separate problem

R3 barely moves (32.0 → 39.8) and its noise floor stays at 1.36 — the only surface where the grain
is not the dominant noise source. Critic pass 7 independently described "heavy blue-white speckle
over all stonework" in that shot. **There is a second, texture-level noise source in the interior
materials**, and it is not this pass's lever. Filed for follow-up.

## G5 — the grain's own justification, reported not gated

`PostFX.js:622` defends the grain as "the only thing keeping the sky gradient off bands". Measured
down a 250-row sky column:

| shot | arm | distinct levels | zero-delta rows | max step |
|---|---|---|---|---|
| `courtyard` | base | 44 | 3 / 249 | 43.8 |
| `courtyard` | g00 | 42 | **30 / 249** | 36.6 |
| `temple` | base | 96 | 3 / 249 | 105.2 |
| `temple` | g00 | 95 | **21 / 249** | 103.3 |

So removing it does introduce flat runs in the sky — 3 → 30 rows on `courtyard`. **But the defence
was already weak**: critic pass 7 measured `night`'s sky at **77 / 249 zero deltas with the grain
on**, worse than `courtyard` gets without it. The grain is stippling Sly's face to buy a sky
improvement that the worst-banded sky in the game does not receive.

## Decision

**Ship `grain: 0`.** Shipping the value that was actually measured, not an intermediate one nobody
rendered — that substitution is the error this ledger keeps recording. The evidence: the noise floor
halves, the critic's headline flat-area metric moves 17×, the frames visibly lose the stipple the
pass called "acne on skin", and the sky cost is small and localised where a targeted dither belongs.

**What ships with it: nothing else.** Defect 1 stays open. The next question is the one `ramp1`'s
seal named as the fallback suspect and this run now supports — **the ramp's band positions and count
against the `N·L` range these surfaces actually span** — and it is a shading change, judged on
frames, not a post-process knob.

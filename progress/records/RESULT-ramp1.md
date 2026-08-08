# RESULT-ramp1 — the fill is not the cause, and the instrument could not have seen the answer

Run against `PREREG-ramp1.md`, sealed before capture. Eight arms, one boot, 6,694 s.

## Gates

| gate | outcome |
|---|---|
| **P-F4** armTook | **PASS** — every arm read back its registered `fillScale` exactly (1, 1, 1, 1, 0.35, 0.1, 1, 0) |
| **P-F5** one boot | **PASS** — token `b89oe009j76u1786158131124` identical on all eight arms |
| **P-F3** determinism | **PASS** — `restore` reproduces `base` to the digit on all four ROIs (20.5 / 21.6 / 32.0 / 25.4) |
| **P-F6** monotonic | **PASS** — 24.9 → 28.7 → 32.3 |
| **P-F2** calibration | **did not fire** — `f00` differs from `base` by 13.1 on R1, so the metric does move with the lever |
| **P-F1** fill-not-primary | **did not fire** — A1 = 32.3, above the 25 floor |

## The registered answer

**A1 = 32.3 %** against a band of **≥ 55 % for "primary cause"**. Not met.

```
base 24.9    f35 28.7    f10 32.3    restore 24.9    f00 31.6
```

**Killing the fill entirely moves mean flatness 24.9 → 31.6, 6.7 points, against the ~60 needed.**
A3 (frame-wide flat-colour area) stays at **1.22 %** with *zero* ambient, against its ≥ 6.0 % band
and the critic's 1.2 % baseline — unchanged. The hypothesis in the seal's §0 is recorded as
**substantially wrong**: the smooth hemispheric fill is a marginal contributor, not the cause.

## The finding that matters more, and it is about the instrument

**The metric could not have detected a toon ramp regardless of the answer.**

Median adjacent-pixel |ΔL| along every scored ROI row, in every arm including `f00`:

```
R1 1.79   R2 1.86   R3 1.64   R4 1.72      (base)
R1 1.72   R2 1.85   R3 1.43   R4 1.50      (f00, no fill at all)
```

**The FLAT metric counts pairs below 1.0. The median is above it.** More than half of all adjacent
pairs are disqualified by per-pixel noise before shading is considered, and the noise floor barely
moves with the lever. A perfectly quantised ramp measured this way would still score ~25–35 %.

### Removing only the noise reveals the ramp

A median filter suppresses per-pixel noise and leaves step edges intact. Applied to the same rows:

| ROI | raw | k=1 | k=2 | **k=4** |
|---|---|---|---|---|
| R1 `sly-startle` base | 20.5 | 47.9 | 59.8 | **70.3** |
| R2 `temple` base | 21.6 | 49.0 | 63.7 | **79.5** |
| R3 `interior` base | 32.0 | 54.8 | 64.9 | **74.5** |
| R4 `courtyard` base | 25.4 | 56.0 | 74.3 | **85.3** |

**On the shipping build, with shipping fill, the underlying shading is 70–85 % flat.** `courtyard`
lands at the > 85 % a quantised ramp is supposed to give.

And once denoised, the fill lever nearly vanishes — `base` → `f10` at k=4 is **−0.8, +3.1, +4.3,
+0.8**. The apparent fill effect in the raw column was mostly the fill changing the noise's
*relative* amplitude, not changing shading structure.

## So critic defect 1 is largely a symptom of critic defect 2

The pass reported "there is no toon ramp anywhere" (defect 1) and "a screen-space grain sits on
everything" (defect 2) as separate items. They are not independent: **the grain is what makes the
ramp unmeasurable and invisible.** The critic came within one sentence of saying so —

> "it is also currently *masking* the shading — my faceting measurement on the shirt was confounded
> by it, which means the team cannot judge their own shader while it is on."

— and I read that sentence, quoted it in `RESULT-critic7.md`, and then built a 112-minute experiment
on the confounded metric anyway. The seal's §0 worried about the wrong thing: it took care to record
evidence against the *fill* hypothesis, and never asked whether the measurement could see a ramp at
all. **Registering a falsifier does not help if the instrument is blind to the phenomenon.** That is
a new failure mode for this ledger, and a more dangerous one than a wrong mechanism, because every
gate passed.

## What is NOT concluded

A median filter proves flat structure exists in the signal. It does **not** prove the frame would
*look* cel-shaded with the grain switched off in-render, because the grain also acts on perception,
and it does not tell us whether the band *positions* are right. Both need a render, not arithmetic —
this ledger retired one instrument already (§203.1) for exactly the sin of shipping on a projection.

## Next

`PREREG-grain1`: capture `base` against `grainScale 0` on the same four shots and the same ROIs, and
score **raw** FLAT. If raw flatness on the grain-off arm lands where the k=4 denoise predicts
(70–85 %), the ramp is confirmed present and the shipping fix is to remove the grain rather than to
rebuild the shading. `fillScale` stays at 1 and no fill change ships.

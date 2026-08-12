# RESULT-bodyhue5 — MECHANISM-ONLY by the seal's letter, and an ADDENDUM proving the letter measured the wrong pixels

Sealed `PREREG-bodyhue5.md` (a86b73e), candidate 78e142c, fresh frames, tree `06207c684e79dbf1`.

## The scored outcome

```
sly-closeup  mask 0.88%  hueA 221.1°  hueB 207.8°  swing -13.2°  |B-ref| 5.7°  P1 PASS  P2 PASS
sly-perch    mask 1.06%  hueA 218.6°  hueB 207.2°  swing -11.3°  |B-ref| 6.3°  P1 PASS  P2 FAIL
OUTCOME: MECHANISM-ONLY        (P2 missed by 0.3° on sly-perch)
```

`bodyMode()` stays `'raw'`. That is the verdict under the registered gates, it is recorded, and
it is not being re-scored. But it must not be *believed*, for the reason below.

## ADDENDUM — the mask floor is a property of the texture PAIR, and the seal carried it across pairs

The tell is in arm A, which does not contain the candidate: the raw texture on `sly-closeup` had
measured **228.4° three times** (runs 4, bodyshift, reproduced to 0.1° across boots) and here
read **221.1°**, with the mask halved (2.17 % → 0.88 %).

PREREG-bodyhue3 §2 derived the ≥ 18 floor as the 5th percentile of rotated-texel deltas — **of
the −21.1° pair**. Recomputed today from the textures alone:

| pair | p05 | p50 | texels ≥ 18 |
|---|---|---|---|
| raw ↔ fix at −21.1° | **18** | 78 | 96.5 % |
| raw ↔ fix at −11.3° | **9** | 42 | 88.5 % |

Half the rotation, half the deltas. At floor 18 the new pair's mask keeps only the most
hue-sensitive pixels — a biased subset that reads ~7° bluer. Re-masking **run 5's own frames** at
the rule-derived floor 9 restores the population exactly:

```
sly-closeup  floor 9   mask 19 160 (2.08 %)   hueA 227.9°     (prior runs: 228.4, 228.4, cov 2.17 %)
sly-perch    floor 9   mask 17 733 (1.92 %)   hueA 221.4°     (prior runs: 221.4, 221.7, cov 1.92 %)
```

Same frames, different floor, arm A returns to within 0.5° of every prior run. The instrument
defect is proven, and it is mine: the seal said "mask ≥ 18, unchanged" when the honest carry-over
was the *rule* (p05 of the pair), not the *number*.

**Quarantined diagnostic, reported for honesty:** at floor 9, run 5's frames read hueB 218.9°
(closeup, 5.4° from reference) and 211.0° (perch, 2.5° from reference) — both inside the P2 band,
swings −9.0° and −10.4°, both inside P1. That would be PASS. It is NOT a verdict: the floor-9
numbers were produced after the frames were seen, which is exactly what §141.1 exists to prevent.
They become the registered *prediction* of `PREREG-bodyhue6.md`, which recaptures fresh frames
with the floor fixed by rule before capture. The diagnostic also exposed a second calibration
artefact: CAL-R's arm gap reads 2.3° on closeup at the smaller rotation (noise scales inversely
with rotation size; valid-instrument gaps were 0.2–1.2° at −21.1°), against NONLINEAR signals of
6.6–11.6° — run 6's cap moves to 3.0° with that derivation stated.

## Score-keeping

- Forecast record: I predicted PASS; the scored outcome is MECHANISM-ONLY → **0/1 for this run**
  (running total 1/3). That the miss traces to my own instrument, not the candidate, does not
  upgrade the forecast — the seal was the instrument's spec, and I wrote it.
- Five capture runs on D2 now; **two** voided-or-confounded by calibrations I specified
  (run 1's two-boot mask, run 5's cross-pair floor), three sound (2, 3 voided by over-strict
  guards on a sound design; 4 and bodyshift scored). The bars P1/P2 have still never moved.

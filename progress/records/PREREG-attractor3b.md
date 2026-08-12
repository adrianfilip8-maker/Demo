# PREREG-attractor3b — attractor3 re-sealed with CAL-FULL derived from the pair it gates

Sealed while the attractor3 capture is in flight: the `sly-closeup` calibration boot has been
seen (disclosed in ADDENDUM-attractor3-calfull.md, quoted below); **the `hero` and `interior`
boots are unseen at sealing time.** Everything not restated here is PREREG-attractor3
(dffabc1) **verbatim** — instrument, conditions, floor, CAL-2/CAL-C, CAL-CHAN, C-READBACK,
C-DRIFT, the S statistic, §4's POSTFX-SIDE / SCENE-SIDE / SHARED bars, and §5's registered
expectation (POSTFX-SIDE, suspect AgX toe/purity compression; forecast record 2/9).

## The one change

> **CAL-FULL (corrected):** composed `sly-closeup` swing within **±2.0°** of bodyhue6's
> **−9.0°** — the current pair's known close-up behaviour, measured under seal on fresh
> frames twice (bodyhue6 −9.0°; attractor3's calibration boot −9.1°).

The original 0.85 floor was the −21.1° pair's number (§282's error class, in a calibration).

## Known at sealing time (disclosed, not usable to move any bar)

```
sly-closeup composed  swing -9.1°  R 0.81   → corrected CAL-FULL fires
sly-closeup rawscene  swing -10.8° R 0.96   → CAL-CHAN fires; S denominator = 0.96
```

The §4 bars evaluate S(shot) = R_rawscene(shot)/0.96 and R_composed(shot) for the two mid
shots only, neither of which exists yet. Knowing the denominator does not move POSTFX-SIDE's
S ≥ 0.85 or SCENE-SIDE's arithmetic toward either outcome.

## Incidental, carried as a finding

PostFX eats ~1.7° of the −11.3° swing at close range (rawscene 0.96 vs composed 0.81):
the display transform is not hue-neutral on the costume even where D2 was scored PASS. This
does not reopen bodyhue6 — its P2 band was met in the composed frame, which is what ships —
but it feeds the §281 accounting: the close-up's "R ≈ 1.0" era belonged to the old pair.

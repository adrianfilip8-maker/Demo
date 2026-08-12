# RESULT-subjhold — NO-SHIP on a voided instrument, while the candidate beat its own forecast on every bar that could be read

Sealed `PREREG-subjhold.md` (88d522a), candidate ed39b18, runner 13f72d6, tree
`df399742aaeb94e8`, floor 9, five boots, C-DRIFT clean on all five.

## The scoreboard (tools/subjholdscore.mjs)

```
20 PASS · 1 FAIL (CAL-FACE-BASE) · 1 VOID (PROT-FACE, by that CAL's rule)

P2-MID   hero      hueB 223.9° → 216.2°   |Δref| 2.7  PASS      (recovered 7.7°)
P2-MID   interior  hueB 224.2° → 217.4°   |Δref| 3.9  PASS      (recovered 6.8°)
PROT-CLOSE         hueB 218.9° → 217.0°               PASS      (stays in band)
PROT-ARCH temple   133 px changed, all in Sly's bbox, corners 0  PASS
PROT-NIGHT         brMed +47 (cooler, not warmer), corners 0     PASS
LOOK (prose, binding): base|hold crops — the subject reads fully moonlit in both; the hold
  DEEPENS the costume's blue in night shade; world pixels identical.                PASS
CAL-FULL −9.5 vs −9.0±2.0 PASS · readbacks live · joint arm: fill leg adds 0.2°
CAL-FACE-BASE: base cream −8 vs sealed [−58,−30] — FAIL → PROT-FACE VOID-INSTRUMENT
OUTCOME: NO-SHIP (ship requires every bar held; a void bar is not a held bar)
```

## What went wrong, and it was not the candidate or the face

I sealed PROT-FACE against **banda's arm-A corridor** [−58, −30]. The currently-certified
baseline is **banda2's BaseGate**: cream ∈ [−28, −12], anchor −20 (RESULT-banda2 §"BaseGate").
The ROI's absolute reading has drifted across arcs — creamfix −44 → banda2 −20 → today −8 —
with `NOTE-readers-frozen.md` §44 already documenting reader drift. §282's error class, third
appearance, this time via the wrong ARC rather than the wrong pair. An absolute face corridor
is rotten across time by construction; the protection's real intent is "the hold must not
MOVE the face", which is a **delta** claim.

Measured (quarantined — reported, not a verdict): the hold moved cream by **1 count**
(−8 → −7) and rings by **1 count** (−1 → 0).

## The forecast, and the joint arm

Registered: MECHANISM-ONLY. Actual: **P2-MID passed on both mids** — wrong again, in the
good direction. Ledger **2/12**. The hero `hold+neutralFill` diagnostic answers attractor4's
epistasis question: with the hold in, greying the fill adds **0.2°** — the shadow leg was
the whole §287 story on the costume, and no fill-side follow-up is warranted.

## Next

`PREREG-subjhold2.md`: every bar verbatim except the face gate — CAL-FACE-N (population
aliveness, n ≥ 200 per ROI per arm) replaces the absolute corridor, and PROT-FACE becomes
**|Δcream| ≤ 7 and |Δrings| ≤ 7** (a quarter of banda's 28-count corridor width — derived
from sealed constants, not from this run's observed 1-count deltas, which are disclosed
above). Fresh five-boot capture; only a full-green run flips `TUNE.subjShadowHold`.

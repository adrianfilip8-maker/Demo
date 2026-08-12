# RESULT-attractor3b — SHARED, scene-side majority: the toon shading eats ~43 % of the swing before PostFX takes its ~25 %

Sealed `PREREG-attractor3.md` (bars) + `PREREG-attractor3b.md` (corrected CAL-FULL; mid shots
unseen at re-seal, commit 0905e48 timestamped before their boots landed). Tree
`61de3de51735d6dc`, floor 9, three boots, C-DRIFT clean on all three.

## The numbers

```
                     composed              rawscene (pre-PostFX, linear channel)
sly-closeup   swing -9.1°  R 0.81      swing -10.8°  R 0.96   (cov 1.85%)
hero          swing -3.7°  R 0.33      swing  -6.3°  R 0.56   (cov 0.25%)
interior      swing -4.1°  R 0.36      swing  -6.0°  R 0.53   (cov 0.25%)

CAL-FULL(corrected) -9.1 within ±2.0 of -9.0 ✓ · CAL-CHAN 0.96 ≥ 0.5 at 1.85% ✓
S(hero) = 0.583 · S(interior) = 0.556        POSTFX-SIDE (S ≥ 0.85 both): NO
SCENE-SIDE bars: hero ≤ 0.557 — missed by 0.026; interior ≤ 0.601 — met.  → SHARED
```

(The rawscene masks shrink ~45 % at mid-range — floor 9 against linear-encoded values — but
sit above CAL-C's 0.20 %. Rawscene absolute hues carry the expected linear-channel offset,
which is why S is channel-relative by construction.)

## The registered share arithmetic

Relative to the close-up through the same channel: the **scene stage** loses 41.7 % (`hero`)
and 44.4 % (`interior`) of the swing before PostFX sees the buffer. The **display transform**
then keeps only 0.59/0.53 of what reaches it against 0.84 at close range — a further 30.4 % /
18.8 % mid-shot-specific loss. Per §4's SHARED rule, **the next seal targets the scene side**
— the toon shading — with the PostFX share documented as real but secondary. Direct evidence
in the raw buffer: between close-up and mid-range, arm A moves +2.8° while arm B moves +7.3°
toward it — the asymmetric pull exists BEFORE the tonemap.

## Forecast

Registered: POSTFX-SIDE (AgX toe/purity). **Wrong — 2/10.** AgX is not innocent (it eats
1.7° at close range and 19–30 % at mid-range) but it is not the majority owner. Six sealed
instruments have now each removed a candidate: rims, mips, ink, edges, shade concentration,
and "it's all the tonemap".

## Next

Scene-side term bisection: the toon shader exposes `debugTerm` channels (holdscope's
instrument). A sealed attractor4 captures the same A/B pairs through individual shading terms
(key / fill-ambient / bounce / spec / detail) to find which term's contribution is
texture-asymmetric at mid-range. Sealed separately with the debugTerm map read first — not
guessed. `PREREG-attractor3`'s own CAL-FULL failure (ADDENDUM-attractor3-calfull) is the
reminder: every bar in it gets derived from THIS pair's record, not remembered from an older
one.

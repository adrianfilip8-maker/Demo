# RESULT-tombdim2 — DO NOT SHIP, but the paired thesis is VALIDATED: the luminance architecture works and the colour consequence is what kills it

Scored against `PREREG-tombdim2.md` (sealed pre-frames, 08a5440 via §311's sweep, provenance
noted forward in 67081f3). One boot, 52 frames, no install (both levers are live `debug` pokes),
`src/` clean at release. Scorer log `tombdim2-score.log`.

## Scoreboard

```
                                    p30 (amb 0.30 x pool 6)      p45 (amb 0.45 x pool 4)
D1 darkness      FAR / VAULT ratio  0.667 / 0.627  PASS          0.779 / 0.755  FAIL (VAULT)
D2 POOL absolute hold               1.032  PASS                  0.998  PASS
D3 SARC absolute hold               0.845  PASS                  0.871  PASS
H1 focal  GOLD-VAULT / SARC-VAULT   +16.4 / +14.5  PASS          +8.0 / +6.9    FAIL
H2 hierarchy non-regression         1.801  PASS                  1.780  PASS
W1 warm/cool separation             114.6  FAIL (bar 120.3)      119.8  FAIL (by 0.5)
W2 dark field stays violet          R-B +0.7  FAIL (bar <= -8)   R-B -11.8  PASS
CT floor between pools              -8.3   PASS                  -9.5   PASS
KO/BG/VB/V4 + all 31 R/B bars       PASS                         PASS
==> DO NOT SHIP (PF1): tombAmb stays 1.0, localToon stays 2.5
```

## The thesis is proved; only the colour is wrong

§307 failed because a lone ambient dim dragged the pools down with the field (POOL hold 0.797).
**The co-lever fixes exactly that**: at p30 the pool is *brighter than base* (1.032, 98.0 vs
95.0 L) while FAR/VAULT fall to 0.63–0.67, and the focal inversion is destroyed —
GOLD−VAULT goes **−1.7 → +16.4 L** (the sarcophagus was *darker* than the wall behind it; now
it is the brightest thing in the room) and SARC−VAULT **−2.0 → +14.5**. r12's own prescription
— "drop ambient and let the torch pools own the exposure" — is confirmed as achievable.

## What kills it (LOOK, binding, performed)

`interior.off` vs `interior.p30`: the sarcophagus and its mask, a dull olive-teal blob in `off`,
now read clearly as the lit treasure — H1 in pixels. **But the entire room turns red-orange.**
The mauve/violet columns saturate to red, the floor goes from pink-grey to orange, and the dark
field warms out of violet (W2: VAULT R−B **−15.0 → +0.7**). It is not murky — the registered
qualitative risk — it is **RED**. That trades r12's "evenly lit lavender storeroom" for the
salmon-monochrome failure that BOTH blind critics rank as the #1 cost family (§304/§308). A bad
trade, and the bars caught it before the pixels had to argue.
p45 keeps the violet (W2 PASS) but buys too little darkness and only half the focal separation.
The two arms **bracket** the answer rather than finding it; W1 fails on both, p45 by 0.5 of 120.3.

## The mechanism, and a convergence worth noting

**The pool term is warm.** Raising it to pay for an ambient dim therefore necessarily warms the
field — the luminance win and the colour loss are the same act. No dose pair escapes that: the
successor cannot be a re-tune (and under §141.1 a new dose pair is a NEW SEAL, not an edit).
The dark field needs a cool source that is **neither the ambient fill nor the pool**. §300 already
proved the hemisphere-fill route fails — recolouring an ambient leg removes the fill's hue split
instead of adding one. So two independent arcs now converge on the same surface: **the cool must
come from the shade-scoped toon shadow-tint path**, which is exactly where §300 routed the
twilight follow-up. One seal could serve both.

## Disposition

Nothing ships; `tombAmb` 1.0 and `localToon` 2.5 unchanged. Forecast was SHIP-at-p30 with the
warm takeover as the named risk — **the named risk fired**, which is the seal predicting its own
failure mode correctly (ledger: forecast wrong, instrument right). Successor: a three-lever seal
(ambient dim x pool gain x shade-scoped cool), sharing the shadow-tint mechanism with the
twilight candidate-2 work.

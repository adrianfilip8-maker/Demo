# RESULT-torchlight3 — SHIP: the one-boot poke A/B goes 42-for-42; the tomb sconces light the toon set at gain 2.5

Scored against `PREREG-torchlight3.md` (a148e33). One boot, CAND tree installed once and
sha-verified (install 80ca393a…, restore 290a1007… == expected), 49 poke frames + manifest.
Frames `progress/records/torchlight3/`; log `torchlight3-score-run1.log`.

## Scoreboard — every registered bar PASS

```
R_1..16 validity (off vs back, same boot):   0 px on ALL SIXTEEN shots
B_1..15 daylight protection (off vs on):     0 px on ALL FIFTEEN above-ground shots
                                             (sly-key's off/on/back arms byte-identical —
                                             sha 99233c86… ×3: the y-gate at IEEE exactness)
P1/P2  POOL effect:      +24.3 L, +92.4 R−B, warm% 2.3 → 89.2   (third replication)
F1     FAR:              +2.14 L / +11.96 R−B, inside the v2-derived bands
F1b    FAR-N ambient:    +0.16 / +1.27, inside bands
KO1    dose:             39.8 @6.0 vs 24.3 @2.5 (×1.64, monotone)
V1-v2  slots:            6 promoted, guard slot tracked, stand delta 0.0 cm (one staging)
F2     guard torch:      15.02 m ≥ 8.5 from the FAR surface (exact-zero premise holds)
V2/V3/V4, BG1, treestamps: all PASS; analytic premise §4 recorded (CAND@0 ≡ BASE)
==> SHIP TUNE.localToon = 2.5
```

Registered forecast: SHIP — RIGHT this time (ledger 5/18). The effect statistics reproduced
runs 4 and v2 to the decimal (+24.3/+92.4/×1.64) — three independent captures, one
mechanism.

## What ships

`TUNE.localToon` 0.0 → 2.5 in `src/render/Lighting.js` (comment re-cited to this RESULT) and
the `tests/torchlight.test.mjs` pin updated to 2.5 with both publish expectations, one
commit. The six tomb sconces — and the patrolling guard's carried torch, registered since v2
— now pour ≈ +24 display L of warm pooled light onto the toon set inside the tomb, fading by
9 m, capped at 1.6 scene-linear, with every above-ground frame proven byte-unchanged in the
same boot. Critic r10's `interior` 4.5 ("torches are bloomy orbs that cast nothing") finally
has its mechanism live.

## The instrument arc, closed

Run 4 (§301): VOID — cross-session resume + unregistered guard torch. v2 (§302): VOID —
boot identity is the drift boundary; cross-boot [0,0] unachievable here. v3: moved every
comparison inside one boot via the R1-proven poke lever, deleted the unachievable bars for
a recorded analytic premise, and went clean. The §296.3 lesson generalises: on this
renderer, a [0,0] pixel bar is legitimate ONLY same-boot; anything cross-boot needs a
measured floor or a different form.

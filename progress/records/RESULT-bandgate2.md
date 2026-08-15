# RESULT-bandgate2 — SHADOW BAND. §336's three-arc item is ALIVE, and the successor aims at the RED

Scored against `PREREG-bandgate2.md` (8a29576). 4 frames, no `src` change, force-added before
scoring. **Every validity gate passed** — unlike bandgate (§340), this adjudicates.

```
V_ROWS  4 rows (want 4)                                        PASS
CAL  (64,128,191) over 23.9% (want >= 5%)                      PASS
R  off-vs-back 0 px (want 0)                                   PASS
CLIP 0.0% of terminator px at 255 (want < 5%)                  PASS
PF_ORDER  median lit 0.549 - median term 0.063 = 0.486 (>=0.25) PASS

TERMINATOR histogram over 1656 px:
   SHADOW (<0.25)  96.4%   MID  3.6%   LIT (>=0.75)  0.0%
bands: SHADOW BAND if frac(SHADOW) >= 0.80  ·  MID BAND if frac(MID) >= 0.50

==> SHADOW BAND
```

## 1. The verdict

**96.4% of the terminator rect is in the ramp's shadow band**, against a sealed 80% bar, with
**zero** pixels in the lit band. The face is not receiving direct key. **A shade-scoped lever can
reach it, so §336's item is alive** and the successor may be sealed.

`PF_ORDER` — the control that replaced §340's mis-aimed `PF_LIT` — passed at 0.486 against 0.25.
The channel separates a visibly lit face from a visibly shaded one by nearly two full band steps,
which is what makes the class assignment mean anything.

## 2. §8.1's disclosure, resolved

The seal disclosed that I had already seen SHADOW 96.4% / MID 3.6% and `PF_ORDER` 0.486 from
bandgate's **voided** frames, and committed that only fresh frames could decide. **The fresh
capture reproduces those numbers exactly** — 96.4 / 3.6 / 0.0 and 0.486 again.

That reproduction is worth more than the verdict, because **the frames are not the same bytes**:
`courtyard.off` is `724afdb8d0a9fa4c` here against bandgate's `7995e426203a5575` on the same tree
— §337's cross-boot instability, which hits some shots and not others. **The measurement is
robust to it.** A histogram over 1656 px landing on the same tenth of a percent across two boots
whose pixels differ says this instrument reads a property of the scene, not of the render's
byte-level noise.

## 3. Forecast

§8 registered **~70/30 SHADOW BAND**. It was **correct**. Credit is modest and bounded: the
prediction leaned on the voided run's mean, which I labelled weak evidence at the time and which
turned out to point the right way. The seal's value was in the *bars*, fixed before the smoke test,
not in the guess.

## 4. What the successor must aim at — and it is not the blue

§336's linear decomposition stands and now has a live target:

```
                          R/G     B/G
courtyard terminator     3.74    1.17     <- B/G ALREADY inside the passing band
kaykit / hero / dunes    0.78 / 0.72 / 0.74
```

**The blue is not missing; the red is.** A seal that "adds blue" would push the half that is
already correct. **Target: linear R/G 3.74 → ≤ 0.90**, holding B/G.

Two code facts from §336, both verified there, that the successor must not trip over:
- **`shadowBounceMix` and `shadowBounceMixLit` are both 0.05**, so the shader's shadow-depth blend
  is an **exact no-op today**. That is either a free lever or a trap for a seal that assumes it is
  live — establish which before building on it.
- **`shadowHold` is 0.0 on all architecture** (`subjShadowHold` is `vSlySkin`-scoped, i.e.
  subject-only), so the colossus currently has **no hold at all**. Whatever lever the successor
  uses must be one that actually applies to architecture.

## 5. Disposition

- **SHADOW BAND.** §336's item is ALIVE; three arcs (§300 twilight, §323 tomb, r13 courtyard)
  converge on a target that is now known to be reachable in principle.
- Nothing ships. This was a measurement seal and proposed no candidate.
- Successor: a shade-scoped tint seal aimed at the **red ratio**, with the two code facts above
  resolved first, and with the same discipline that has been paying — warm-up 2 (§331),
  live-settle staging (§328/§334), an ordering-style control rather than an absolute one (§340),
  and force-added frames (§329.1/§335).

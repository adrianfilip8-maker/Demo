# RESULT — hilite1: the frames have no highlight range

Prereg: `progress/records/PREREG-hilite1.md`. No threshold registered there has been moved.

---

## 1. The diagnosis — established by arithmetic, before any capture

### 1.1 The tone chain is NOT the wall

The shipped composite grade was transcribed exactly (`scratchpad/chain.mjs`: exposure 0.95 →
lift × `liftDayScale` → gain → split-tone → saturation 1.30 → pivot contrast 1.08 →
`slyAgX(shoulder 1.0)` → sRGB, plus `Common.js`'s gamut map). **Calibration arm:** this repo's
own validated grey-axis rows, quoted in `PostFX.js` at `liftDayScale` and `splitRange`.

```
scene   0.002 0.004 0.006 0.010 0.018 0.030 0.060 0.105 0.18  0.5   1.0
repo      7.7  11.7  15.9  23.4  36.0  50.8  76.3 100.5 126.3 175.7 204.8
mine      7.7  11.7  15.9  23.4  36.0  50.8  76.3 100.5 126.3 175.7 204.8   <- exact, 11 of 11

scene    0.02  0.05  0.08  0.18  0.35  0.50  0.72  1.00  2.00
repo       39    69    88   126   159   176   192   205   227
mine     38.7  69.2  88.4 126.3 158.9 175.7 191.7 204.8 227.1               <- <= 0.4 L, 9 of 9
```

The instrument fires. With it, the chain's own ceiling:

```
grey scene  1.0 -> L 204.8   2.0 -> 227.2   2.5 -> 232.7   4 -> 241.7   8 -> 250.1   >=20 -> 254.7
```

**Display L 230 needs scene ≈ 2.3, and the chain hands it over.** Nothing above 230 is being
eaten by AgX, by the exposure, or by the grade. This kills the obvious first hypothesis.

### 1.2 The supply is the wall, and a perfect white lands exactly on the threshold

`slyRamp` returns `clamp(acc/steps, 0, 1)`, so the key term is capped at 1 and a diffuse
surface tops out at `albedo × keyRad`. At the golden anchor
`keyRad = #ffd9a0 × sunIntensity 3.30 = (3.30, 2.29, 1.18)`, luma **2.425**. Through the
calibrated chain, fully sunlit (ramp 1, no shadow, no AO, no haze):

| surface | display L |
|---|---|
| §2.2 `sandMid` #c9915a albedo | **197.1** |
| §2.2 `sandLight` #e6b878 albedo | **213.2** |
| a **perfectly white** albedo (1, 1, 1) | **230.8** |

A perfect white, fully sunlit, under the shipped key, renders at **L 230.8** — the exact
threshold the critic says nothing reaches. Real stone renders 197–213, and most of the frame
is below even that: a ground plane under a 22° sun has `ndl = 0.375`, which lands between
`termLo` 0.14 and `termHi` 0.52 and so sits on the ramp's **0.5** step.

**The top of the range is empty because nothing in the scene is bright, not because the top of
the curve is closed.**

### 1.3 The one real HDR emitter is never in frame

`Sky.js` `sunCore: 26.0` multiplies `uSunDisc` — a genuine HDR emitter, easily display-white.
Projected through each canonical camera's real frustum (its own fov, roll, aspect 1280×720):

```
shot         tod   sunEl  sunAz  camFwdAz  in frustum?   sun NDC
hero         0.79   22.0  186.0    233.1       no        (-1.65,  1.94)
temple       0.72   33.0  170.0    256.6       no        (-4.72,  5.14)
courtyard    0.76   26.0  180.0    278.9       no        ( 9.71, -9.04)
sly-closeup  0.80   21.0  186.7    296.6       no        ( 3.95, -2.48)
dunes        0.83   15.0  191.0    247.0       no        (-2.36,  1.75)
traversal    0.77   25.0  181.5    243.4       no        (-3.19,  3.02)
combat       0.74   29.5  175.0    220.2       no        (-1.75,  2.83)
```

**Seven of seven.** So the sky's hot core contributes nothing to any shipped frame's top end,
and highlight range has to come from sunlit surfaces or from nowhere.

### 1.4 Corroboration from the whitest material in the build

`shots/bloom1/sly-closeup-bloomoff.png` is the shipped bloom-disabled frame. Sly's sclera is
the highest-albedo surface in the game (`PostFX.js`: `alb 0.79 × keyRad 3.29 = 2.59`).
Whole-frame: **max 230.7, and 0.000 % of pixels above 230.** With bloom off, one pixel in the
entire frame reaches the threshold, on the whitest material there is. My chain predicts that
surface at L 224.4 against the repo's two independent quotes of "≈224" and "fixed-ROI p50 218 /
max 228.5" — a cross-check, not the registered calibration.

### 1.5 And the ground is darker than the sky, which is inverted for a desert

`courtyard` row-mean luma: rows 0/20/60/100 (sky) **146 / 144 / 132 / 119**; rows
420/500/600/700 (ground) **72 / 68 / 71 / 73**. The sky is roughly twice the ground. Raising
PostFX's exposure lifts both; raising the KEY lifts only what the sun reaches. That is why the
lever is the key and not the exposure.

### 1.6 The daylight shadow light cannot follow the key up, which makes this a contrast lever

`ToonMaterial._refreshShadowColor()` asks for `k = shadowFloor·keyLum / tintLum` and then
applies `k = min(k, TUNE.shadowTintPeak / peak)` = **3.904**. Its own table at that site records
every daylight shot asking for 6.50–9.79 and receiving 3.904, so the daylight shadow light is a
**constant** `(0.123, 0.175, 0.423)`. `A.ambientIntensity` is computed in `evalAtmosphere` from
the un-boosted key, so the fill does not scale either. In daylight, a key gain therefore moves
**only the direct key term**.

---

## 2. Instrument arms

*(filled from `shots/hilite1/report.json`)*

## 3. The bracket

## 4. Verdict against the registered gates

## 5. Forecast vs measurement

## 6. What shipped

## 7. What did NOT get resolved, and who owns it

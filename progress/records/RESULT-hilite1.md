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

### T7 — scene-readback calibration: **FIRED**

`shading.debugTerm(4)` writes `(64, 128, 191)/255` into the linear scene RT. The HalfFloat
readback used for every scene-radiance number below — the *identical* code path — found that
triple on **75.99 % of the frame** (700 325 px), against a 5 % bar. The next four modal triples
are its immediate neighbours (`64,127,190` ×12 458, `66,130,192` ×9 574, …), i.e. the dither and
resolve skirt, not a different value. The instrument is not blind, so the radiance numbers in
§1.7 are quotable.

### 1.7 (added after the capture) — the scene buffer says the same thing the arithmetic did

Read straight out of PostFX's linear HDR `sceneRT`, before AO, bloom and the grade. **§1.1 says
display L 230 needs scene ≈ 2.3.** So the last column is the whole defect, measured at source:

| shot | scene lum p50 | p99 | p99.9 | max channel | share > 0.73 | > 1.5 | **> 2.3** |
|---|---|---|---|---|---|---|---|
| hero | 0.0660 | 0.780 | 1.033 | 3.81 | 1.68 % | 0.019 % | **0.000 %** |
| temple | 0.0953 | 0.601 | 0.869 | 2.46 | 0.27 % | 0.003 % | **0.000 %** |
| courtyard | 0.1470 | 0.730 | 1.430 | 8.23 | 1.07 % | 0.089 % | **0.018 %** |
| sly-closeup | 0.0856 | 0.780 | 1.461 | 4.04 | 1.13 % | 0.060 % | **0.004 %** |

The 99th-percentile *scene radiance* of a golden-hour desert frame is **0.60–0.78**, and the
share of the frame that reaches the radiance display white requires is **0.000–0.018 %**. The
frames are not missing highlights because the curve is closed; there is nothing to tonemap.
(The stray high `maxch` values — courtyard 8.23, sly-closeup 4.04 — are single specular or
emissive pixels, which is why they move `>1.5` by hundredths of a percent and `p99` not at all.)

`dayAmount` read back as **exactly 1** on all four shots and `uKeyIntensity` as exactly
`atmoSunIntensity` on the base arm, which is the identity PREREG §3 depends on.

## 3. The cause the bracket exposed — the daylight cameras are shot INTO the sun

This was not in the prereg. It is what the failing bracket forced me to go and measure, and it
is the real finding of this run.

### 3.1 Every canonical daylight camera faces surfaces the key does not reach

Camera-facing wall N·L (`cameraFacingWallNL`, the same helper `tests/tone.test.mjs` already
uses for the §214.1 moon table), against the ramp's terminators `termLo 0.14 / termHi 0.52`:

```
ramp 0    hero -0.6308 · kaykit -0.3152 · temple -0.0496 · courtyard +0.1393
          dunes -0.5400 · traversal -0.4264 · combat -0.6129 · sly-profile -0.6243
ramp 0.5  sly-closeup +0.3168 · sly-perch +0.3168 · sly-key +0.3168 · interior +0.2125
ramp 1    sly-startle +0.6470 · sly-arm +0.8578
```

**Twelve of the fourteen daylight shots — including all seven environment shots — have their
camera-facing vertical surfaces at ramp 0 or 0.5.** §214.1 measured exactly this for the two
moon-keyed shots and concluded it explained `night`; nobody had run it on the daylight ones.

> **CORRECTION, caught by my own test before this document was committed.** The first draft of
> this section said "not one daylight shot has a camera-facing wall at full key". That is false:
> `sly-startle` (+0.6470) and `sly-arm` (+0.8578) clear `termHi` comfortably. I had measured the
> seven environment shots and written the sentence as if it covered all fourteen. The assertion
> I wrote to lock the finding in went red on exactly those two, which is what the assertion was
> for. The two exceptions are character turnarounds — different camera azimuths around one
> subject — and they now serve as the test's calibration arm, because a build that contains
> front-lit framings proves the reading can come out the other way.

### 3.2 Confirmed against the real geometry, not just the wall model

`scratchpad/ndlmap.mjs` raycasts each shot camera through ARCHITECTURE + PROPS on a pixel grid,
takes each hit's world normal and evaluates **ToonMaterial's own `slyRamp`**. Calibration arm
(must fire): the same `slyRamp` must return exactly 1 at N·L = 1, exactly 0 at N·L = −1 and
0.500 at N·L = 0.33 — **it did**, so the histogram is reading N·L and not a constant.

Share of *visible geometry*, by ramp level:

| shot | ramp = 0 (no key at all) | ramp ≈ 0.5 | ramp = 1 | mean ramp |
|---|---|---|---|---|
| hero | **72.3 %** | 27.3 % | **0.4 %** | 0.140 |
| temple | 54.8 % | 23.8 % | 21.4 % | 0.311 |
| courtyard | 60.1 % | 23.8 % | 16.1 % | 0.279 |
| sly-closeup | 32.3 % | 45.0 % | 22.7 % | 0.452 |
| dunes | **85.2 %** | 13.1 % | **1.7 %** | 0.080 |
| traversal | **79.6 %** | 19.6 % | **0.8 %** | 0.106 |
| combat | 66.7 % | 33.3 % | **0.1 %** | 0.166 |

**In `hero`, 0.4 % of what the camera can see is at full key and 72.3 % receives no key light
at all. In `dunes` — the shot whose §7.2 job is terrain and atmosphere — it is 1.7 % and 85.2 %.**

That is the whole answer. The key term is multiplied by a mean of 0.08–0.45 before it reaches
the frame, and the two terms that *do* light these surfaces — the daylight shadow light (§1.6,
a constant pinned at its cap) and the fill (`uAmbIntensity`, computed from the un-boosted key) —
are both independent of sun intensity. **These frames are not made of sunlight.**

### 3.3 There IS an azimuth that fixes it, and it is 240° round

Same instrument, sweeping an offset onto the shipped sun azimuth (mean visible ramp, and the
share at full key):

| shot | shipped | +200° | **+240°** | +280° |
|---|---|---|---|---|
| hero | 0.138 / 0.5 % | 0.673 / 40.5 % | **0.720 / 44.7 %** | 0.532 / 32.3 % |
| courtyard | 0.260 / 15.1 % | 0.454 / 13.1 % | **0.704 / 56.9 %** | 0.722 / 56.3 % |
| temple | 0.308 / 20.8 % | 0.383 / 27.3 % | **0.611 / 52.4 %** | 0.613 / 55.2 % |
| sly-closeup | 0.443 / 21.7 % | 0.377 / 1.2 % | **0.538 / 31.5 %** | 0.644 / 32.2 % |
| dunes | 0.080 / 1.7 % | 0.635 / 29.3 % | **0.837 / 68.7 %** | 0.748 / 64.1 % |
| traversal | 0.106 / 0.8 % | 0.520 / 15.4 % | **0.791 / 62.7 %** | 0.732 / 61.3 % |
| combat | 0.166 / 0.1 % | 0.626 / 27.7 % | **0.713 / 45.6 %** | 0.563 / 39.4 % |

**+240° is a simultaneous optimum or near-optimum for all seven.** It takes the share of
visible surface at full key from 0.1–21.7 % to 31.5–68.7 %. Smaller offsets do not work — the
+40/+80/+120 arms are at or *below* the shipped value on `courtyard` and `temple`, which is why
"nudge the sun" is not a fix and the whole sweep had to be run.

**This is NOT shipped, and shipping it blind would be the mistake this project keeps paying
for.** `SUN_AZIMUTH` is in my file, but +240° turns the golden-hour track from a western sunset
into an eastern sunrise: every cast shadow in the game reverses, `Sky.js`'s warm horizon band
and Mie lobe move to the other side of the dome, `Lighting`'s shaft geometry re-derives, and the
§8.1 pyramid-shadow and peristyle-blade analyses in `Lighting.TUNE` are all written against a
westering sun. It is a lead-level art decision with a whole-game blast radius and it needs a
frame verdict, not a ramp histogram. What is established here is the *arithmetic*: the
composition is the cause, and this is the size of the prize.

## 4. The bracket

All arms captured in one boot at `dt = 0`, `shots/hilite1/`. **The "before" everywhere below is
this run's own `base` arm, never `shots/r8/`** — see T6b.

| arm | shot | p1 | p50 | p90 | p99 | max | >200 | >230 |
|---|---|---|---|---|---|---|---|---|
| base | hero | 15.4 | 71.1 | 154.9 | **182.6** | 232.2 | 0.066 % | **0.000 %** |
| k140 | hero | 16.8 | 74.1 | 156.0 | 183.6 | 232.4 | 0.089 % | 0.001 % |
| k170 | hero | 16.8 | 74.2 | 156.9 | 183.9 | 235.3 | 0.112 % | 0.001 % |
| k210 | hero | 16.8 | 74.3 | 158.4 | 184.8 | 239.1 | 0.150 % | 0.002 % |
| k260 | hero | 16.9 | 74.4 | 160.1 | **186.4** | 241.4 | 0.209 % | **0.003 %** |
| base | temple | 30.7 | 88.2 | 144.7 | **180.2** | 229.2 | 0.070 % | **0.000 %** |
| k260 | temple | 31.2 | 89.8 | 145.7 | **181.8** | 241.1 | 0.263 % | **0.019 %** |
| base | courtyard | 23.4 | 102.8 | 159.6 | **180.4** | 237.2 | 0.189 % | **0.003 %** |
| k260 | courtyard | 24.0 | 110.2 | 167.2 | **201.6** | 238.0 | 1.107 % | **0.066 %** |
| base | sly-closeup | 25.3 | 84.5 | 124.2 | **179.4** | 239.4 | 0.212 % | **0.005 %** |
| k260 | sly-closeup | 26.4 | 88.3 | 155.1 | **211.3** | 248.1 | 1.866 % | **0.280 %** |

(k140/k170/k210 for temple, courtyard and sly-closeup are in `shots/hilite1/report.json` and
interpolate monotonically; the two ends are quoted here.)

**A 2.6× sun — `sunIntensity` 3.30 → 8.58 — buys `hero` 3.8 L of p99 and `temple` 1.6 L.**

### 4.1 The response tracks the ramp histogram, which is the mechanism confirming itself

| shot | mean visible ramp (§3.2) | Δ p99, base → k260 |
|---|---|---|
| sly-closeup | 0.452 | **+31.9 L** |
| courtyard | 0.279 | **+21.2 L** |
| temple | 0.311 | +1.6 L |
| hero | 0.140 | +3.8 L |

The two shots with the most key-lit visible surface are the two the key lever moves, and
`hero` — 0.4 % of its visible geometry at full key — barely responds to a sun nearly three
times as bright. `temple` is the outlier in the other direction and is explained by haze: it is
the deep hypostyle interior, where the visible surface is far from the camera and dissolved
toward a haze colour that has no sun term in it.

## 5. Verdict against the registered gates

| gate | requirement | best arm | result |
|---|---|---|---|
| **T1** | p99 ≥ 200 on ≥ 3 of 4 shots | k260: **2/4** (courtyard 201.6, sly-closeup 211.3) | **FAIL** |
| **T2** | > 230 share ≥ 0.20 % on ≥ 3 of 4 | k260: **1/4** (sly-closeup 0.280 %) | **FAIL** |
| T3 | p50 ≤ 130 everywhere | max 110.2 | pass |
| T4 | > 250 share ≤ 1.0 % everywhere | 0.000 % everywhere | pass |
| T5 | p1 ≤ 45 everywhere | max 31.2 | pass |

**Selection rule outcome: NONE. No arm passes T1 and T2, so by the rule registered before the
capture, the defect is NOT closed by this lever.** No threshold has been moved and none will be.

### Instrument arms

* **T7 CALIBRATION — FIRED.** `debugTerm(4)`'s control triple on 75.99 % of the frame (§2).
* **T8 APPLIED STATE — passes.** Five distinct applied `uKeyIntensity` fingerprints, and
  `base == base2` exactly as required. Read off the live uniform, per shot:
  `base 3.3000|3.3807|3.3117|3.2859` → `k260 8.5800|8.7898|8.6105|8.5434`. No arm collapsed.
* **T6a NULL ARM — FAILED, and by the rule I registered that makes this run VOID.** `base2`
  minus `base`, same setting, same boot, `dt = 0`: `hero` **0 px**, `temple` **0 px**,
  `sly-closeup` **0 px**, `courtyard` **11 px of 921 600, max Δ 3 codes**. I registered
  "must differ on 0 pixels … anything else means the instrument moved under me and the run is
  VOID", and 11 is not 0. **So: VOID, as registered.**

  What I will not do is quietly reinterpret that threshold now that I have seen the number. What
  I will say, separately, is what the failure can and cannot explain: an instrument that wobbles
  by ≤ 3 display codes on 0.0012 % of one frame cannot turn a real +20 L effect into a measured
  +1.6 L one, and the run's conclusion is a **negative** — the direction instability of this size
  cannot manufacture. The load-bearing finding of this report (§3) comes from a different
  instrument entirely, is capture-free, and is untouched by this.
* **T6b PROVENANCE — MISSED, as anticipated in the prereg.** `base` vs `shots/r8/` p99:
  hero Δ 1.22, courtyard Δ 2.57, temple Δ 5.28, sly-closeup Δ 7.24 against a 2.0 L bar. The tree
  moved between r8 and this boot — `src/textures/Materials.js` carries another owner's
  uncommitted saturation edits (its HUE table's `satLo` 1.30 → 1.78 and siblings), which is
  exactly the drift the prereg named. **Per the registered consequence, no cross-boot comparison
  to r8 is used anywhere above**; every A/B number is `base` vs an arm from this one boot. The r8
  table in §1 is quoted only as the reproduction of the critic's own figures, not as a "before".

## 6. Forecast vs measurement

**Forecast 1 — WRONG, and here is the error.** I predicted `k210` or `k260` would win, on the
grounds that the top 1 % of each frame was 81–95 % "warm" by an R−B > 18 test and would
therefore scale with the key. **Nothing won.** The test was a bad proxy: `R − B > 18` cannot
distinguish sunlit stone from *warm haze* (`fogColor` #e8b878) or from warm shadow-side stone
lit by the sand bounce. All three are warm; only one scales with the sun. The forecast table
predicted p99 202–215 at k260 and the measurement is 181.8–211.3, missing low on three of four.
That miss is what sent me to §3, so it earned its place — but it was wrong.

**Forecast 2 — CONFIRMED, exactly.** I predicted from the shadow-light cap correction that p1
would move ≤ 3 L across the whole bracket. Measured, base → k260: hero 15.4 → 16.9 (+1.5),
temple 30.7 → 31.2 (+0.5), courtyard 23.4 → 24.0 (+0.6), sly-closeup 25.3 → 26.4 (+1.1). All
within 1.5 L. The daylight shadow light really is a constant pinned at its own cap, and the key
lever really does move only the lit side.

## 7. What shipped

**No pixel-changing lighting change.** The bracket says the sun-intensity lever is near-dead in
the shipped framings, and shipping the root-cause fix (the azimuth track) blind — unverified in
any frame, with a whole-game blast radius — is precisely the move this project has lost days to.

What ships is the record and a tripwire:

1. `src/render/Atmosphere.js` — the measurement written where the next person will look for it:
   at `sunIntensity` in the anchors (why raising it is dead, with the response curve) and at
   `SUN_AZIMUTH` (the backlight geometry and the +240° sweep). **Comments only; zero pixels.**
2. `tests/tone.test.mjs` — a new assertion that no canonical daylight shot has a camera-facing
   wall at or above `termHi`, carrying its own calibration arm. It is red the day someone fixes
   the composition, which is the point: the conclusion above expires when that happens.
3. This document, `PREREG-hilite1.md`, and `KNOWN_ISSUES` §NNN.

## 8. What did NOT get resolved, and who owns it

* **The defect is open.** Luma p99 is 179–183 and the > 230 share is 0.000–0.005 % on the
  shipped build, and nothing in this run changed that.
* **The root cause is composition, and it is not one owner's.** At the shipped sun azimuth,
  32–85 % of the visible geometry in every daylight shot receives *no key light*. Fixing it is
  either **SHOTS** (re-frame the cameras so they are not looking into the sun) or **LIGHTING +
  the lead** (turn the golden-hour track from a western sunset into an eastern sunrise, the
  +240° arm, which the sweep says lifts every one of the seven shots at once). The second is
  mine to implement but not mine to decide, and it needs a frame verdict.
* **The two terms that actually light these frames are not mine.** The daylight shadow light is
  pinned at `ToonMaterial.TUNE.shadowTintPeak / peak` = 3.904 and is a constant across every
  daylight shot; its own note says so and says the magnitude "is set by `PAL.shadowTintPeak` and
  by nothing else". That is **SHADING's** knob and it is the one that decides how bright 32–85 %
  of every daylight frame is.
* **The ramp's `{0, 0.5, 1}` levels** put a 22° sun's ground plane on the 0.5 step
  (`ndl = 0.375` between `termLo` 0.14 and `termHi` 0.52). **RAMP's.**
* **Not attempted, and stated so it is not assumed:** `Sky.js`'s sun neighbourhood
  (`sunHaloStrength` 0.85 against the disc's `sunCore` 26) is under-powered, but the disc is
  outside the frustum in all seven daylight shots (§1.3), so no change there is verifiable in
  the canonical set. I did not touch it.
* **This run is VOID by its own T6a rule** (§5). The bracket should be re-run if anyone wants to
  quote its numbers as anything other than "the lever is small"; the §3 geometry finding needs
  no re-run.

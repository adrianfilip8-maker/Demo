# RESULT-rim — VALID. M1 SHARED · M2 DOWNSTREAM · M3 SCREEN-RIM-LIVE

**Seal:** `PREREG-rim.md`, registered 2026-08-15 before any frame existed.
**Capture:** `progress/records/rim1/`, 15 frames, 3 chunks, force-added at `a9b58ef`.
**Scorer:** `progress/records/rim/rim-score.mjs`, the registered instrument, run on the complete
manifest. Raw output kept below.

**I got all three forecasts wrong.** That is the headline and it is recorded first, before the
numbers that make it look reasonable in hindsight.

| row | forecast (§10) | measured | |
|---|---|---|---|
| M1 | SURFACE-OWNED ~85/15 | **SHARED**, 62/38 | ✗ |
| M2 | UPSTREAM ~60/40 | **DOWNSTREAM** | ✗ |
| M3 | SCREEN-RIM-INERT ~80/20 | **SCREEN-RIM-LIVE** | ✗ |

---

## 1. Every gate passed, and the defect reproduced almost exactly

```
V_ROWS         PASS   15 rows          V_CHUNKS  PASS  3        V_CHUNK_TREE  PASS  b3852e39472ed68f
R_night        PASS   0 px             R_sly-profile PASS 0 px  R_hero        PASS  0 px
CAL_night      PASS   74.1%            CAL_sly-profile PASS 14.3%  CAL_hero   PASS  80.2%
CLIP_night     PASS   0.0%             CLIP_sly-profile PASS 1.4%  CLIP_hero  PASS  2.4%
PF_EDGE        PASS   1 dropped (allow <= 3), 20 kept
PF_REPRO_KEY   PASS   5/5 SPIKE edges >= 20.0 L
PF_REPRO_SHAD  PASS   0/7 SHADOW edges >= 20.0 L; mean shadow spike 0.51 L
PF_NIGHT       PASS   |BODY-BG| 4.3 / 3.4 / 3.5 / 3.2 L
```

**Three chunks, three exact 0-px brackets.** `back` came back byte-for-byte identical to `off` in
every shot, across five arms including two that bypass the composite. The §328/§330 live-settle-
then-freeze staging plus §331's two discarded warm-up renders is reproducible across boots, not a
one-off — this is the bracket litbleach VOIDed on.

**The one dropped edge is `night/torso-right`, PINNED**, exactly as §1(f) registered it in advance:
the ink and the background are both near black, so no minimum exists in the ±6 window. Registered
as instrument-invalid before any frame existed; dropped as instrument-invalid on the frames.

**The defect reproduces to two decimal places on a different tree.** `KEY5 mean spike(off) =
28.27 L` against the sealed reference `KEY5_MEAN_R12 = 28.27 L`. The SHADOW7 mean is **0.51 L**
against r12's registered **+0.53 L**. Per-edge, all 20 kept edges land within **±0.05 L** of §1.2.
`hero/glove-right` — the counterexample §1.3 named rather than buried — lands at **10.21** against
10.2, still 9.8 L under threshold, which keeps `PF_REPRO_SHADOW` a real test rather than a
formality.

### The one thing that did NOT reproduce, and why it costs nothing

**Background luminance moved, character luminance did not.** `sly-profile`'s BG rose 8–16 L on every
edge (`torso-front` 36.9 → 52.69, `muzzle-front` 37.9 → 52.76); `night/cap-top`'s fell 13.5 → 7.12.
**`hero`'s BGs reproduced exactly** (22.13/22.1, 71.20/71.2, 57.33/57.3, all eight). So the shift is
*shot-specific*, not systematic — an earlier note of mine called it systematic and that was too
broad.

This is §0's substitution argument confirmed quantitatively rather than asserted. It predicted
exactly this: `Guard.js`, `Particles.js`, `Props.js` and `CarmelitaGuard.js` changed between r12 and
this tree, and those put guards and props behind Sly in some framings and not others. **The seal's
statistic is `spike = RIM − BODY`, both terms on the character, so it is immune.** `sep = RIM − BG`
is not, and no sealed bar uses `sep` — checked: `PF_EDGE`'s floor is an **RGB distance** ≥ 8.0
against measured 16.0–174.4, and `PF_NIGHT`'s |BODY−BG| bar absorbs cap-top's shift at 4.3 vs ≤ 8.0.

---

## 2. M1 — the key-side band is SHARED, 62/38

```
KEY5 mean spike(off)        28.27 L      (r12 reference 28.27 L)
  share_surf   (screenoff)  17.60 L      bar for SURFACE-OWNED >= 19.79
  share_screen (off-scr.)   10.67 L      bar for SCREEN-OWNED  >= 19.79
M1  SHARED
```

Neither path clears 70 %. Path A carries **62.3 %**, Path B **37.7 %**.

**My forecast was 85/15 and the reasoning behind it was wrong in a specific way.** §10 argued Path B
could only be small because "Path B's only measurement is 0.3 L" (`PostFX.js:101`). That 0.3 L was
measured **on architecture** — hero's step-lip box — and the seal itself said so in §2 and promised
to measure it on the character instead. I then forecast using the number I had just finished
explaining was measured in the wrong place. Path B on the character is **36× its architecture
figure**.

The 0.70 band was chosen to give Path B a 28× margin over its own prior measurement before the
verdict could flip. It flipped anyway. A generous band did its job: SHARED is a real result, not a
threshold artefact.

---

## 3. M2 — the shadow-side band IS emitted in linear, at nearly DOUBLE the shader's own attenuation

```
raw linear spike  hero         KEY 34.01   SHADOW 8.73   ratio 0.257
raw linear spike  sly-profile  KEY 46.97   SHADOW 8.82   ratio 0.188
Rlin (mean of per-shot ratios)  0.222      DOWNSTREAM >= 0.112 · UPSTREAM <= 0.056
M2  DOWNSTREAM            (night excluded by §4 — it carries no key-side reference)
```

**This is the decisive row.** §2 computed, from the shipped constants by 4000-sample quadrature,
that Path A's own `mix(0.55,1,sh) · mix(0.45,1,wrapRim)` legs plus the `mix(0.60,1,wrapRim)` inside
the `smoothstep` should deliver **11.2 %** of the lit-side band on the shadow side. Measured:
**22.2 %** — nearly twice the shader's own documented attenuation.

So the shader is **over**-delivering relative to its own arithmetic, and the band still does not
reach the screen: the same edges carry a display-space shadow-side mean of **0.51 L** against a
key-side **28.27 L**, i.e. 1.8 %.

**§3's central argument is refuted.** It reasoned that AgX's `log2` slope diverges as `v → 0`, so a
rim of identical linear magnitude arrives ~3.1× *more* visible on a dark base than a bright one, and
concluded: *"the display transform cannot be what removes the shadow-side rim. It is the one term in
the chain that is biased in the defect's favour."* The measurement says the band is emitted in
linear and is gone by the screen. Whatever the gain table says about an isolated additive increment,
the composite chain removes this one.

**My registered refuting condition was mis-specified.** §10 said: *"The single condition that would
refute my reading of this whole file: `M2 = DOWNSTREAM` with `M3 = SCREEN-RIM-INERT`."* I got
`M2 = DOWNSTREAM` with `M3 = SCREEN-RIM-LIVE`, so the literal compound did not fire — **but M2 =
DOWNSTREAM alone refutes §3, and M3 was never part of that test.** I bolted a second condition onto
a refutation that did not need it, which made my own falsifier harder to trigger than the claim
deserved. Recorded as a defect in how I wrote the forecast, not as a reason the claim survives.

---

## 4. M3 — Path B is LIVE on the shadow side, and delivers 30 % of what it owes

```
Sscreen  mean over SHADOW7 of spike(off) - spike(screenoff)   3.87 L
         INERT <= 1.0 · LIVE >= 3.0     (Path B's contract owes 0.45 x 28.27 = 12.72 L)
M3  SCREEN-RIM-LIVE
```

**The arithmetic this exposes was not anticipated anywhere in the seal.** Mean shadow-side
`spike(off)` is **0.51 L** and Path B contributes **3.87 L** of it, so:

```
mean spike(screenoff) over SHADOW7 = 0.51 - 3.87 = -3.36 L
```

**With Path B off, the shadow-side "rim" band is 3.4 L DARKER than the body it sits on.** Path A
alone does not produce a weak rim there — in display space it produces an *anti*-rim. Path B lifts
it back to roughly zero. The measured near-nothing on the shadow side is not one term failing; it is
one term digging a hole and another filling it in.

That also reconciles M2 and M3, which look contradictory: the same Path A reads **+0.222** of its
key-side band in linear and **−0.19** (−3.36 / 17.60) in display. The sign inverts across the
transform.

**`SCREEN-RIM-INERT` was the outcome that would have falsified `toon.glsl.js:1210-1212` — *"Path B
carries its own shadow-side floor. That is where the shadow-side rim lives now."* That sentence
survives, and only just.** Path B is live, and it delivers 3.87 L of the 12.72 L its own
`uRimShadowFloor = 0.45` contract owes — **30 %**. The claim in `src` is true in direction and short
by 3.3× in magnitude. It is not a false declaration and should not be retired; it is an
under-delivering one, and the successor now knows by how much.

---

## 5. §9 BINDING LOOK — all three performed, all three pass

1. **`night.off` vs `night.screenoff`, 1× and 6× on Sly.** *Distinguishable.* `off` carries thin
   cyan outlines down the body's left edge, along the glove's upper boundary and around the cap,
   which `screenoff` lacks or renders much weaker. Localisation supports the eye: **38.5 %** of
   pixels differ inside a 45×60 box on Sly against **8.8 %** whole-frame, so the change is
   concentrated on the character rather than bled in from architecture. **SCREEN-RIM-LIVE is not
   overruled.**
2. **`hero.off` / `sly-profile.off` shadow-side silhouette against §7.3.** *Reads as NOT separated.*
   In `sly-profile` the asymmetry is plain: the chest and shoulder facing the key carry a bright
   edge down the coat (the +30.03 L `torso-front` spike), while the back and right flank against the
   tan wall are separated only by the ink outline and by value/hue contrast. The tail shows it in one
   object — a pale edge along its **top** (`tail-top`, KEY, +28.71) and none on its **right**
   (`tail-right`, SHADOW, −3.41). **§1's table is measuring the right thing; the M-rows stand.**
3. **`hero.raw` recognisable.** *Yes* — Sly on the ledge, temple architecture, guards in the
   courtyard, sunset sky. Not black, not constant, not garbage. Its heightened contrast is the linear
   scene target presented undecoded, which `CAL` proved in-boot at 80.2 %. **M2 is not VOID.**

---

## 6. THE ROUTE THIS SELECTS

**POSTFX / display space** — and §3 enumerated this outcome correctly even as it argued against it:

> If **Path A** is emitting its documented 11.2 % in linear and it still does not read, the deficit
> is downstream and the lever is **display-space / POSTFX** — §333's route, for a different reason.

That is what happened, with the emission at 22.2 % rather than 11.2 %. **The seal worked; the
forecast did not.** Its bands discriminated cleanly, its pre-flight proved the defect reproduced
before anything was adjudicated, and its own §3 listed the branch that fired. Everything that failed
here was my prediction, not the instrument — which is the entire reason forecasts are registered
separately from bars.

**What the successor inherits, and none of it is a candidate (§8 — this seal proposes none):**

- The lever is **not** `wrapRim` at `toon.glsl.js:1031/1190`. Path A already emits **2×** its
  documented shadow-side band. Turning it up attacks the half that is working.
- The deficit is between the linear buffer and the screen, and the shape of it is now known
  precisely: **Path A's shadow-side contribution inverts sign across the transform**, +0.222 in
  linear to −0.19 in display.
- **Path B is the term already in the right space, already live on the character, and already
  under-delivering against its own written contract by 3.3×.** `uRimShadowFloor = 0.45` is the
  number that owes 12.72 L and pays 3.87 L.
- Any successor bar should be **relative** — a fraction of the key-side band on the same edges —
  because §342.1/§342.2 established on a different item that an absolute bar silently imports the
  calibration surface's own properties.

---

## 7. SCORER OUTPUT, VERBATIM

Kept so the table above can be checked against the instrument rather than against my transcription.
See `progress/records/logs/rim-score.txt`.

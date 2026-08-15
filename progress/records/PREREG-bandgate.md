# PREREG-bandgate — is courtyard's terminator the ramp's SHADOW band or its MID band?

**Lane:** SHADING (shadow-tint). **Date sealed:** 2026-08-15.
**Ancestry:** §300 twilight → §323 tomb → r13's courtyard terminator → **§336** (the item is a
SHADING defect; AgX refuted by a within-frame matched-luminance control) →
`NOTE-shadowtint-instrument.md`.

**Status: REGISTERED before any capture.** `progress/records/bandgate1/` does not exist at this
sha. **Frame count: 4**, one shot, one chunk, warm-up 2 discarded renders (§331).
**No `src` change** — the instrument already exists.

## 1. Why this gates everything downstream

§336 established the shadow-tint item is real and upstream of the display transform, and reframed
it: in scene-linear **the blue is not missing, the red is** (terminator R/G **3.74** against
0.72–0.78 on the shots that pass; B/G 1.17 already inside the passing band). Three independent
arcs converge here, so it is the project's strongest open lead.

But §336 left one question unanswered, and it can kill the item outright: **a PNG cannot
distinguish the toon ramp's `shadow` band from its `mid` band.** `TUNE.bands: 3`, so the ramp
quantises to three levels. If the sampled colossus face is the **mid** band it is receiving
direct key by construction, and "345° → 218°" is **unreachable at any legal dose** — §332's exact
failure shape, where a lever engages correctly and cannot reach its own bar. Sealing a tint lever
before knowing this would repeat that failure knowingly.

## 2. The instrument, which needs no mechanism

`toon.glsl.js:1454` already writes it:
```glsl
else if ( uDebugTerm < 5.5 ) dbgT = vec3( ramp, ndl, key );
```
`debugTerm(5)` puts **`ramp` in R**, `ndl` in G, `key` in B. Read through
`postfx.debugRaw('scene')`, which §333 established presents the buffer **linear and undecoded** —
proven in-boot by `debugTerm(4)` reading `(64,128,191)`, i.e. `0.25 × 255 = 63.75`. So the ramp
value at a pixel is exactly `R / 255`, with no decode to get wrong.

## 3. Rects — verified, not inherited

Measured on `shots/r12/courtyard.png` and reproducing §336's own numbers:

```
LIT control   [ 908, 322,  948, 358]   H   5.6  S 0.627  L 101.6    (lane: #ba5045 h 5.8 s 0.631)
TERMINATOR    [1044, 322, 1090, 358]   H 348.3  S 0.505  L  70.7    (lane: h 345.2, L 70.7 exact)
```

**The rect must not extend past x ≈ 1090**: x ≥ 1096 measures **L 102.6 / H 16.6**, *brighter*
than the terminator, so it is off the colossus rather than deeper shade. Recorded because
sampling it would have measured a lit surface and called it shadow — §332's ROI error class.

## 4. Arms — 4 frames

| arm | state |
|---|---|
| `off` | normal render — the baseline and the pixel set |
| `ramp` | `debugRaw('scene')` + `debugTerm(5)` — ramp/ndl/key, linear |
| `cal` | `debugRaw('scene')` + `debugTerm(4)` — the in-boot bypass proof |
| `back` | normal render — the §302 bracket against `off` |

## 5. VALIDITY — fail-closed

| gate | bar | on failure |
|---|---|---|
| `CAL` | `cal` reads `(64,128,191)` ±1 over ≥ 5% of frame | **VOID** — the bypass is not a bypass |
| `R` | `diff(off, back) == 0 px` | **VOID** |
| `CLIP` | < 5% of measured px at 255 in `ramp` | **VOID** — an 8-bit blit of an HDR target |
| `V_ROWS` | 4 rows | **VOID** |
| `PF_LIT` | the LIT control's mean `ramp` ≥ 0.80 | **VOID** — if the control is not lit, the readback is not being read correctly, and no reading over the terminator means anything |

`PF_LIT` is the instrument's own control and it is the one that makes this seal trustworthy: a
surface the frame shows in full sun must report a high ramp. If it does not, the channel is not
what I think it is.

## 6. THE MEASUREMENT AND ITS SEALED BANDS

`rampT` = mean `R/255` over the TERMINATOR rect in the `ramp` arm.

| outcome | bar | meaning |
|---|---|---|
| **SHADOW BAND** | `rampT ≤ 0.20` | the face is in the ramp's shadow band. **The item is ALIVE**: a shade-scoped tint lever can reach it, and the §336 successor may be sealed. |
| **MID BAND** | `rampT ≥ 0.35` | the face is receiving direct key. **345° → 218° is unreachable at any legal dose**; the item closes as mis-aimed, and the successor must instead target the *lit* path or the geometry, not the shadow tint. |
| **INCONCLUSIVE** | between | say so; claim neither. |

Bands are set from `TUNE.bands: 3` — a three-level ramp puts shadow at ~0, mid at ~0.5, lit at
~1.0 — with generous margins either side of the midpoint so a partially-dithered edge does not
decide the verdict.

## 7. What this seal does NOT do

**No candidate, no dose, no `TUNE` change, no acceptance bar on a fix.** Like PREREG-linchroma it
is a measurement seal: its only product is a number and the route that number selects. Nothing in
`src` moves on any outcome.

## 8. Registered forecast

**~60/40 SHADOW BAND.** The face reads L 70.7 against a lit control at L 101.6 — a 31 L gap that
is easier to explain as a band step than as a within-band falloff. Against that: §336 found the
terminator is *not* darker than shots whose shadows pass (hero L 70.0), which is consistent with
a mid band on a bright surface. I hold this loosely; the whole point of the seal is that I cannot
tell from the pixels.

## 9. Disposition

- Any validity gate FAIL ⇒ **VOID**, nothing claimed, diagnose and re-run.
- §141.1 absolute: no band here moves once a frame exists. A re-seal is a NEW file.

# PREREG-keyprobe — is the colossus's shade face still receiving direct key?

**Lane:** SHADING (instrument readback only). **Date sealed:** 2026-08-15.
**Ancestry:** §277/§312 → §336 (the shadow-tint item is a SHADING defect; *"the ONE measurement
that settles it: a `key` (= `ramp * sh`) readback over the terminator rect"*) → §341 (bandgate2,
SHADOW BAND 96.4 %) → §342 (the albedo attributed) → **§342.1, whose reachability verdict §342.2
withdrew for taking its suppression off a surface that may still be keyed**.

**Status: REGISTERED before any capture.** `progress/records/keyprobe1/` does not exist at this sha.

**This seal proposes no candidate, no dose, no `TUNE` change and nothing ships.** It produces one
number per registered rect and the routing that number selects. §336 named this measurement, and
the item has now failed to substitute for it **twice** — once in §342.1 (a mismatched control), once
in §342.2 (which corrected the control and *still* had to condition every figure on an unmeasured
`sh`). This is that measurement.

**Frame count: 5** — one shot, one boot, 5 arms. **No `src` change**: every arm is an existing debug
hook, and the two quantities are already written by the shipped shader.

---

## 1. WHY IT NEEDS NO `src` CHANGE — verified at this sha

```
toon.glsl.js:495   float ramp = slyRamp( ndl, uBands );
toon.glsl.js:492   float sh   = smoothstep( uShadowSharp.x, uShadowSharp.y, shadowRaw );   (then optionally banded, :493)
toon.glsl.js:528   float key  = ramp * sh;
toon.glsl.js:1454  else if ( uDebugTerm < 5.5 ) dbgT = vec3( ramp, ndl, key );
toon.glsl.js:1455  else if ( uDebugTerm < 6.5 ) dbgT = vec3( specStep / 1.35, lobe, sh * step( 0.02, ndl ) );
```

`debugTerm(5)` writes **`ramp` (R), `ndl` (G), `key` (B)** in one arm. Since `key = ramp * sh` is the
shader's own definition — and `toon.glsl.js:645` says so in prose — **one arm decomposes the product
completely: `sh = key / ramp` wherever `ramp > 0`.** No second arm is needed for the answer; `term6`
is carried only as a cross-check and is **not** load-bearing, because its `sh` is gated
`sh * step(0.02, ndl)` and therefore reads 0 in deep shade whatever `sh` is. That gate is the reason
mode 6 alone could not answer this question and mode 5 can.

`debugTerm` values are written **pre-AgX** into the linear scene target, so they are only meaningful
through `postfx.debugRaw('scene')` — ToonMaterial's own docstring says so (*"without that half the
constants are carried through AgX and the grade and mean nothing"*). Bytes are then **undecoded**,
i.e. `value * 255`, which `CAL` proves in-boot rather than assuming (§333 / linchroma §2).

---

## 2. THE RECTS — §336's own, unmodified

Taken verbatim from `progress/records/shadowtint/roi.json`, the file the 3.74 / 1.02–1.86 / 0.52
figures were measured through. Not re-drawn, not re-aimed (§141.1):

| id | rect `[x,y,w,h]` | class | what it is |
|---|---|---|---|
| `SHADE_R` | `[1020, 260, 90, 130]` | shade-terminator | **the rect under test** — colossus-R's shade face, §336's R/G **3.74** |
| `CAST_L` | `[70, 150, 280, 300]` | shade-cast | colossus-L, the cast-shadowed TWIN — §342.2's matched control, R/G 1.02–1.86 |
| `LIT_R` | `[872, 300, 60, 210]` | lit | colossus-R's lit face, R/G 5.48 |
| `GROUND` | `[380, 600, 520, 110]` | both | the courtyard ground, R/G 0.52 |

Shot: **`courtyard`**, 1280×720 — the frame all four came from.

---

## 3. ARMS AND STAGING — 5 frames, one boot

| arm | state | what it is for |
|---|---|---|
| `off` | shipped render | the LOOK frame and the rect sanity check |
| `cal` | `debugRaw('scene')` + `debugTerm(4)` | the bypass proves itself **in this boot**: must read (64,128,191) |
| `term5` | `debugRaw('scene')` + `debugTerm(5)` | **the measurement** — `(ramp, ndl, key)` |
| `term6` | `debugRaw('scene')` + `debugTerm(6)` | cross-check only; `sh` gated by `step(0.02, ndl)`, NOT load-bearing |
| `back` | shipped render, restored | the same-boot 0-px bracket against `off` |

**Staging — live-settle then freeze (§328/§330):** `setShot('courtyard', {})` with `dt` **UNDEFINED**,
then **2 discarded warm-up renders** (§331), then each arm with `step(2,0)` + `renderFrame(0)`.

---

## 4. VALIDITY — fail-closed, before anything is read

| gate | bar | on failure |
|---|---|---|
| `V_ROWS` | 5 rows, one src hash | **VOID** |
| `R_bracket` | `diff(off, back) == 0 px` | **VOID** |
| `CAL` | `cal` reads (64,128,191) ±1 over ≥ 5 % of frame | **VOID** — the bypass is not a bypass and nothing read through it means anything |

## 5. THE INSTRUMENT PROVES ITSELF ON TWO KNOWN RECTS BEFORE READING THE THIRD (§340)

This is the whole discipline of this file. `SHADE_R` is the unknown. The other two rects have
**known** lighting states, and the instrument must reproduce both or it is not measuring `key`:

| gate | rect | bar | why that value is known in advance |
|---|---|---|---|
| `PF_KEY_HI` | `LIT_R` | mean `key` **≥ 0.50** | a face registered `lit`, measured at R/G 5.48 in full sun. If direct key does not read high here, the channel is not `key`. |
| `PF_KEY_LO` | `CAST_L` | mean `key` **≤ 0.02** | registered `shade-cast`; `NOTE-shadowtint-space.md:258` states outright that this object has **`sh = 0`, hence `key = 0`**. This is the negative control and it is somebody else's claim, not mine. |

**Both must pass or the run VOIDs and `SHADE_R` is not read at all.** A one-sided control proves
only that a number moves; two-sided proves the channel spans the range the question lives in.

## 6. THE MEASUREMENT AND ITS SEALED BANDS

`K1 = mean key over SHADE_R`, on `term5`'s **blue** channel as `byte/255`, undecoded (CAL proves it).
Reported alongside `mean ramp` (red), `mean ndl` (green) and the derived **`sh = key/ramp`** over
texels where `ramp > 0.02`.

| outcome | bar | what it routes |
|---|---|---|
| **KEYED** | `K1 ≥ 0.10` | the shade face is still receiving direct key. §342.2's corrected reading holds: the redness is a **key leak**, the shadow wash never had full authority there, and the successor's lever is whatever closes that leak — **not** the albedo and **not** `shadowHold`. |
| **DARK** | `K1 ≤ 0.02` | the face is fully shadowed and **§342.2's corrected reading is REFUTED**. The wash has full authority and granite still lands at 3.74, which sends the item back to the **albedo** (§342) as the only remaining term. |
| **INCONCLUSIVE** | between | say so plainly; claim neither, and do not reinterpret the bands. |

**Derivation of the two numbers, and they are deliberately not symmetric.** `0.02` is not invented:
it is `PF_KEY_LO`'s own bar, i.e. the largest value the instrument is allowed to report on a rect
that is *known* to be unkeyed. Using the same constant for `DARK` means the seal cannot call
`SHADE_R` dark unless it is as dark as a surface the record already calls `key = 0`. `0.10` is **5×**
that floor — a face carrying a tenth of full direct key leaves the shadow wash `1 − key` = 90 % of
its authority at most, which is the mechanism `NOTE-shadowtint-space.md:262` names. The gap between
them is where the seal is allowed to say it does not know.

## 7. REGISTERED FORECAST — falsifiable, before any frame exists

- **K1 = KEYED, ~75/25.** Three things point the same way and none of them is a measurement of
  `key`: `SHADE_R` is registered `shade-**terminator**` rather than `shade-cast`; the twin at
  `CAST_L` — same material, same tint, same frame — reads 1.02–1.86 where this rect reads 3.74; and
  the lane wrote the mechanism down as a hypothesis (*"the sampled pixel is not in the shade band at
  all — it is a partially key-lit band, and the shadow tint has only `1 − key` of the authority
  there"*). The 25 % is that **§341's bandgate2 put this rect at 96.4 % SHADOW BAND**, which is a
  real measurement pointing the other way — and the reason it is not decisive is exactly §342.2's
  Error 2: bandgate2 measured **`ramp`** (an N·L quantity) and this measures **`sh`**. If they
  disagree, that disagreement is the finding.
- **`sh` on `SHADE_R` ≈ 0.3–0.7.** Stated so that a value pinned at 0 or 1 is visibly a surprise.
- **`PF_KEY_HI` and `PF_KEY_LO` both pass, ~90/10.** They are the record's own claims about its own
  rects; if either fails, the failure is about the instrument or the rects, not about the colossus,
  and it is reported that way.

**The single condition that would refute my reading of this item:** `K1 = DARK` **with**
`PF_KEY_LO` passing. That would mean the shade face has no key leak, the wash had full authority all
along, and §342.2 — written 40 minutes ago to correct §342.1 — corrected it in the wrong direction.
I will record that as written rather than reinterpret the bands.

## 8. WHAT THIS SEAL DOES NOT DO

No candidate, no dose, no `TUNE` change, no ship, no `src` movement on any outcome. It does not
re-open §342's attribution, which is texture arithmetic against a proven control and does not depend
on any of this. Its only product is `K1`, the derived `sh`, and the route they select.

## 9. BINDING LOOK

1. Open `courtyard.term5.png`. The frame must show recognisable structure — a black, constant or
   garbage frame is an instrument failure and **VOIDs** `K1` whatever it computes to.
2. In `term5`, `CAST_L` must be visibly darker in **blue** than `LIT_R`. If a human cannot see that
   difference, the two-sided control passed on numbers a viewer cannot confirm, and every row is a
   NO-CLAIM.

A LOOK failure is a NO-CLAIM on the row it touches, regardless of the table.

## 10. DISPOSITION

- Any validity or pre-flight gate FAIL ⇒ **VOID**; nothing is claimed about the shade face.
- All gates PASS ⇒ record `K1` against §6 and route the successor by it.
- **§141.1 absolute:** the rects, the **0.50 / 0.02** control bars and the **0.10 / 0.02** decision
  band are fixed now, in advance. If the fresh frames make any of them look badly chosen, that is a
  finding to write down, not a threshold to move, and a re-seal is a NEW file.

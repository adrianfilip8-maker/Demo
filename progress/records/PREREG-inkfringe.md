# PREREG-inkfringe — finding #9: the ink pass's luminance-keyed warm/cool selection

Owner: SHADING/POSTFX. Sealed before `tone2`'s ink arms land.
Instrument: `scratchpad/inkfringe.mjs`, offline, no lock. Reproduce with `node inkfringe.mjs`.

## 1. Why this is exactly computable, unlike most of this file

§80.4 established `TUNE.chroma = 0.0`, so finding #9 is **not** chromatic aberration, and named
the candidate: PostFX's ink pass picking warm vs cool ink **by pixel luminance**.

That candidate needs no capture to model, because the ink block runs **after `slyAgX` and after
`slyLinearToSrgb`** (`PostFX.js:1085–1140`) and its uniforms arrive already in display space via
`displayColor()`. There is no tonemap between the arithmetic below and the framebuffer — which is
the opposite of the sphinx rim, where the whole AgX chain sits in the middle.

```glsl
float line = edge.r;
float lum  = slyLuma( c );
line *= smoothstep( 0.05, 0.20, lum );
vec3 ink = min( mix( uInkCool, uInkWarm, smoothstep( 0.12, 0.55, lum ) ), c );
c = mix( c, ink, clamp( line, 0.0, 1.0 ) * uInkStrength );
```

## 2. The mechanism is real and produces the named signature

A moulding 2 px wide sweeps its own luminance across the entire `[0.12, 0.55]` selection window,
so the two sides of one moulding receive **different ink hues**:

| pixel's own luma | ink selected | delivered | hue |
|---|---|---|---|
| 0.16 | violet, clamped | `(29,21,29)` | **300°** |
| 0.28 | violet-ish | `(27,19,30)` | 284° |
| 0.40 | mixed | `(30,21,24)` | 345° |
| 0.62 | warm | `(35,25,21)` | **16°** |

Across one lit/shadowed moulding pair that is a **76° hue split** — orange on one side, violet on
the other, on adjacent pixels. That is the signature the critic described, and it confirms §80.4's
candidate as *mechanically present*.

## 3. But the amplitude is small, and that is the part that decides the finding

| | R | G | B | L |
|---|---|---|---|---|
| warm-side line | 35 | 25 | 21 | 26.4 |
| cool-side line | 29 | 21 | 29 | 23.2 |
| **delta** | **+6.1** | **+3.5** | **−7.8** | +3.2 |

A 76° hue split at **±8/255** on pixels of luma ~25. Whether that reads as a colour fringe or as
two very dark lines is not something the arithmetic can settle, and FXAA runs after this pass and
can only blend the two sides further — so these are **upper bounds** on the separation.

## 4. The falsifiable prediction, registered before the frames exist

The model says the fringe must be **asymmetric**, because two separate terms suppress the dark
side and neither touches the lit side:

- `line *= smoothstep( 0.05, 0.20, lum )` fades the line out below luma 0.20 (at 0.16 it is
  already down to 0.82, at 0.12 to 0.45, at 0.08 to 0.10);
- `min( ink, c )` clamps the violet to the surface where the surface is darker than the ink.

So the ink pass produces **a warm line on the lit side against a weak, clamped, nearly-uninked
dark side** — not a saturated violet line facing a saturated orange one.

> **Therefore: if finding #9's fringe is a symmetric orange/blue pair, the ink pass is NOT its
> cause.** True chromatic aberration is symmetric by construction. This is the discriminator, and
> it is available from the same frames the arm produces.

## 5. The arm

| arm | shot | `postfx.tune.inkStrength` |
|---|---|---|
| `ink-traversal-on` / `ink-hero-on` | `traversal`, `hero` | 0.95 (shipped) |
| `ink-traversal-off` / `ink-hero-off` | `traversal`, `hero` | **0.0** |

`traversal` is the shot §80.4 examined at 4×; `hero` is added because it is the shot with the most
moulding-per-pixel and the one the critic scores hardest.

**`inkStrength 0` is a clean on/off for this pass and nothing else** — it multiplies only the final
mix in the block above. It does not touch the edge pass, so the *mask* is unchanged and any pixel
that changes between the arms changed because of the ink composite alone.

**Poke path (§80.5, checked in source):** `uInkStrength` **is** re-written every render from
`tune.inkStrength` at `PostFX.js:1794`, so the arm must poke `postfx.tune.inkStrength`. Poking the
uniform is silently reverted. (`uToneShoulder` in the same run is the exact inverse — see
`ADDENDUM-tone1-never-ran.md` §"A second trap".)

## 6. Outcomes, registered

- **Fringe disappears at `inkStrength 0`, and it was asymmetric** → finding #9 is the ink pass,
  attributed. Fix is the selection rule, not the colours: key the warm/cool choice off the
  *surface's own* shading term rather than off post-grade pixel luminance, so a moulding gets one
  ink hue along its length instead of one per side.
- **Fringe disappears, but it was symmetric** → the arm is confounded; something else in the block
  (the `line` luma ramp itself) is doing it. Re-seal.
- **Fringe survives `inkStrength 0`** → the ink pass is exonerated, §80.4's candidate is dead, and
  the finding returns to unattributed with `chroma` and ink both eliminated by test rather than by
  argument.

Nothing ships from section 2. It establishes that the term *can* produce the signature; §23 is the
standing reminder that this is not the same as it *being* the cause.

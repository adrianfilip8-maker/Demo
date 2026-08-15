# NOTE — the shadow-tint band gate can be answered with NO src change, and its rects are verified

Offline. Written so the band-gate seal can be authored and launched without re-deriving anything.
§336 left the shadow-tint item **gated** on one question: is courtyard's colossus terminator the
toon ramp's **shadow** band or its **mid** band? If mid, it is 50% direct sun by construction and
"345° → 218°" is unreachable at any legal dose — §332's failure shape, and the item would close
before a seal is written.

## The instrument already exists

`toon.glsl.js:1454`:
```glsl
else if ( uDebugTerm < 5.5 ) dbgT = vec3( ramp, ndl, key );
```
**`debugTerm(5)` writes `ramp` into R, `ndl` into G and `key` into B.** Combined with
`postfx.debugRaw('scene')` — which §333 established presents the buffer **linear and undecoded**,
proven in-boot by `debugTerm(4)` reading `(64,128,191)` — the ramp value at any pixel is just
`R / 255`.

So the band question is answered by **reading a channel**, with **no `src` change, no
`uKeyIntensity` manipulation and no new mechanism**. Same shape as linchroma (§333), which is the
cheapest instrument this project has found.

**Reading:** `ramp ≈ 0` ⇒ shadow band, the item is alive and a lever can reach it.
`ramp ≈ 0.5` (or whatever `TUNE.bands`' mid level is — read it, do not assume) ⇒ mid band, the
face is half direct sun, and the 218° target is unreachable. Either way the seal is 4 frames.

## Rects, verified here against the lane's own numbers

Measured on `shots/r12/courtyard.png` (r13 is gone, §335):

```
LIT control        [ 908, 322,  948, 358]   H   5.6  S 0.627  L 101.6   rgb(182, 81, 70)
TERMINATOR         [1044, 322, 1090, 358]   H 348.3  S 0.505  L  70.7   rgb(114, 58, 69)
```

The terminator rect reproduces §336's reading — **L 70.7 exactly**, hue 348.3 against the lane's
345.2 and the critic's 345.6 (the small spread is patch selection, not disagreement). The lit
control reproduces the lane's `#ba5045 h 5.8 s 0.631`.

**One negative worth keeping:** x ≥ 1096 reads **L 102.6, H 16.6** — brighter than the
terminator, so it is *off the colossus*, not deeper shadow. The rect must not extend past ~1090.
That is the kind of ROI error §332 was written about, caught before it was sealed.

## What the seal should be

4 frames, one shot, one chunk: `off` · `ramp` (`debugRaw('scene')` + `debugTerm(5)`) · `cal`
(`debugTerm(4)`, the in-boot bypass proof) · `back` (the 0-px bracket). Warm-up 2 (§331),
live-settle staging (§328/§334), force-add (§329.1), and the CAL/CLIP/R validity gates linchroma
used — `CLIP` matters here too, since `debugRaw` is an 8-bit blit of an HDR target.

It proposes **no candidate**: like linchroma it is a measurement seal whose only product is a
number and the route that number selects.

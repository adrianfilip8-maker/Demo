# PREREG-inkfar — why distant silhouettes get no ink (critic 9, D10)

Registered **before** the capture exists. Companion to `PREREG-inkblack.md`; same lane, same
discipline, different defect.

---

## 1. The defect

Critic 9 D10, on `traversal.png` (top) and the right/centre pyramids in `dunes.png`:

> The pyramid edge against the sky steps in hard ~10 px jumps (median jump width 11 px in
> `traversal`, 9 px in `dunes` centre) with a 1-pixel transition and a maximum luminance step of
> 0.587 — no antialiasing whatsoever. The distant geometry also receives **no ink outline at all**
> while midground objects receive a heavy one, so the outline system reads as depth- or
> resolution-limited rather than as a deliberate weight hierarchy.

D10 is **two** complaints, exactly as D5 was, and only the second is this lane's:

- **D10a, no ink on distant geometry.** The ink systems, which this lane owns.
- **D10b, the silhouette is unfiltered and steps.** That is FXAA and the pyramid's own course
  count, and **the stepping is not aliasing** — `Terrain.js:277-297` authors 11 and 9 courses
  deliberately and derives that count from this very camera ("9.5 m per course reads as deliberate
  massing at ~27 px instead of as a jagged edge at 12.6 px"). A critic measuring "median jump
  width 11 px" is measuring the masonry, not a rasteriser. Whether the 1-px transition at each
  course should be filtered is a real question and it is **not** in this pre-registration.

**This document covers D10a only.** No number produced here may be quoted about D10b.

---

## 2. What the brief pointed at, and why reading says it is already off

The lane brief names `Outline.js`'s `uFalloff` / `INK_NO_FALLOFF` / `falloff = 140` as the thing to
investigate. Reading says that term **cannot** be the cause, and the run is built to check that
rather than to assume it:

- `createOutlineMaterial` writes `uFalloff: { value: INK_NO_FALLOFF }` (`Outline.js:478`) — the
  authored `falloff` argument is accepted and deliberately discarded (`:442-457`, `:505`).
- The shader computes `mix(1.0, 0.62, smoothstep(18.0, uFalloff, dist))` (`toon.glsl.js:1364`).
  With `uFalloff = 1e9` the smoothstep argument is below float32 epsilon for any scene distance, so
  the mix is bit-exactly 1.0.
- Nothing else in `src/` writes `uFalloff`.

So the hull's distance falloff is switched off in the shipped build and is **not** available as an
explanation. Two other mechanisms are, and both are derivable from source:

**M1 — the crease pass has its own distance fade, and it reaches zero.** `PostFX.js:987`:
`line *= 1.0 - smoothstep( uFade.x, uFade.y, z0 )`, fed per frame from
`edgeFadeStart 45` / `edgeFadeEnd 190` metres (`PostFX.js:40-41`, copied at `:2022`). Beyond 190 m
the crease ink is exactly zero. A second, weaker term stacks in front of it at `:914`:
`weight = mix(1.8, 0.70, smoothstep(7, 55, z0))`.

**M2 — the pyramids refuse ink outright.** `Terrain.js:1085` authors `outline: 0` on the pyramid
material. `Outline.js:591-598` and `ToonMaterial.applyOutlines` both read `> 0` as "asks for ink",
so the pyramids are `refused`, not `missing` — they would get no hull even if anything walked them.
And nothing does: **`applyOutlines()` has no call site in `src/`**, so `Architecture.js` and
`Terrain.js` build no hulls at all, which is the state `Outline.js:52-56` already documents.

`PYRAMIDS` sit at `(-150, -190)` and `(95, -250)` (`Terrain.js:298-301`). Their distance from each
camera is **not** transcribed here — the capture measures it, because a distance quoted from a
coordinate pair is exactly the kind of number this lane has been getting wrong.

---

## 3. Instrument

Definitional again — the ink is the pixels the ink levers change, so there is no detector and no
threshold on "is this a line". Shots: `dunes` and `traversal`, the two frames D10 names. One boot
per shot, `dt = 0`, 1280x720, all levers page-side.

| arm | lever | what it isolates |
|---|---|---|
| `A-ship` | none | shipped |
| `F-nofade` | `tune.edgeFadeStart = 1e9`, `edgeFadeEnd = 1e9 + 1` | M1, the crease fade |
| `H-hull` | `shading.outline(mesh)` on each `pyramid_*` mesh | M2, the absent hull |
| `FH-both` | both | the two together |

`uFade` is copied from `tune` inside `_renderChain` every frame (`PostFX.js:2022`), so arm F needs
no rebuild. Arm H builds a real shell through the shipped code path rather than faking one.

**The pyramid band.** Every claim is scored inside a mask defined by the pyramids themselves, not
by a hand-drawn box: the capture renders one extra frame per shot with the `pyramid_*` meshes
hidden, and `pyrMask = { p : shipped(p) != pyramidsHidden(p) }`, dilated by 4 px so the silhouette's
outer side is included. The capture also reports, per pyramid, the distance from the camera to its
nearest and farthest vertex in view space.

---

## 4. Calibration, claims, falsifiers

### Calibration (MUST FIRE — a null voids the run)

- **CAL-F1** `pyrMask` covers between 0.5 % and 40 % of each frame. Outside that the mask is not
  the pyramids.
- **CAL-F2** each lever must move **some** pixel **somewhere in the frame**: `|A - F| > 0` and
  `|A - H| > 0`. This is the sensitivity arm, and it is deliberately scored over the whole frame
  rather than inside `pyrMask` — a lever that only moves pixels outside the band is still a live
  lever, and conflating "the lever works" with "the lever works *there*" is how a dead lever gets
  reported as a mechanism.
- **CAL-F3** arm H must report `shellsBuilt == pyramidMeshCount` and that count must be non-zero.
  `shading.outline()` returns null for a mesh it refuses, so a silent refusal would otherwise make
  M2 look disproven when it was never tested.

### Claims

- **PF1 — the pyramids are beyond the fade.** Measured nearest-vertex view distance of every
  `pyramid_*` mesh **exceeds `edgeFadeEnd`** in both shots.
  **FF1:** any pyramid nearer than `edgeFadeEnd` refutes "the fade is why", because the fade
  cannot zero a line at a distance where its smoothstep has not reached 1.
- **PF2 — M1 is real and sufficient.** In `pyrMask`, arm `F-nofade` changes **>= 2 %** of the mask's
  pixels, and the mean luminance there **drops** (ink is subtractive; a rise means the lever added
  light and the mechanism is misread).
  **FF2:** under 2 % refutes M1 — removing the fade does not put ink on the pyramids, and the crease
  pass is failing them for some other reason.
- **PF3 — M2 is real and sufficient.** In `pyrMask`, arm `H-hull` changes **>= 2 %** of the mask's
  pixels with a mean luminance drop.
  **FF3:** under 2 % refutes M2 — a hull on the pyramids does not produce a visible line, which
  would point at the hull's own clip-space width or its haze term rather than at its absence.

2 % is set from the geometry rather than from taste, and it is set now: a 2.5 px line around a
silhouette whose mask is a filled triangular region is a thin rind on a large area, and 2 % is
comfortably below what a continuous 2.5 px outline of that region subtends while being far above
per-pixel dither. If it turns out that both arms land just under 2 % the honest answer is that both
mechanisms are weak, not that the threshold was wrong.

### Registered outcomes

`BOTH` (PF2 and PF3 both met — two independent causes, and fixing one is not enough) ·
`M1 ONLY` · `M2 ONLY` · `NEITHER` (both refuted — the cause is something this document did not
name, and the falloff is already excluded, so the next suspect is the hull's own aerial-perspective
term at `toon.glsl.js:1412-1417`) · `VOID` (any calibration null).

### Not being tested here

D10b, the unfiltered silhouette. Also **not** in scope: whether distant ink is *desirable*.
`edgeFadeStart/End` exist because "lines thin out with distance so the far field isn't a black
mess" (`PostFX.js:40`), and the reference frame's own far field is not uniformly inked. This
document establishes **why** the ink is absent. Whether to restore it, and how much, is an art
decision that needs its own frame verdict and does not inherit this run's PASS.

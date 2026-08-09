# RESULT — inkscale: the ink was not a wide line, it was a fill; and the hull was being displaced

Pre-registration: `PREREG-inkscale.md` (written before any capture produced a number) and
`ADDENDUM-inkscale-baseline.md` (written after the control run, before any candidate frame existed).
Instrument: `progress/records/inkw.mjs`. Frames: `inkw-before/`, `inkw-after/`.

Assigned defect — critic pass 8's ranked ink complaint:

> **Ink width varies 1 px → 29 px on a single character in one frame**, and tracks
> depth-discontinuity magnitude — "the signature of an edge detector, not an art-directed line."
> At 76 px tall in `courtyard`, median ink is 5 px = **6.6 % of his height**.

**Three mechanisms, none of which is "the hull is too wide".** Two of them were invisible to a
median. The largest one is not a width at all.

---

## 1. How ink was separated from shadow, terminator and dark albedo

Every arm is one boot, one staged frame, `dt = 0`, one lever moved. **A pass's mask is the set of
pixels that got darker when that pass was switched on.** A cel shadow, the terminator and Sly's own
blue-black albedo are present in both arms and cancel to exactly zero — they cannot enter the mask
however dark they are. Nothing here thresholds absolute luminance anywhere, which is precisely what
a dark-pixel count (the critic's method, and the obvious method) cannot avoid.

Width is the **minimum chord**: for each mask pixel, the maximal run of mask pixels through it along
four axes, smallest kept. Exact for a straight band at 0°/90°, +1 px at 45°, and — the property the
whole exercise turns on — **it does not grow with the band's length**. Verified on synthetic bands
at `t ∈ {1,2,3,5,9} × {0°,45°,90°}` before any frame was read; the run aborts if that fails.

A LINE has a small minimum chord everywhere along it. A SMEAR does not.

---

## 2. Mechanism 1 — the crease pass was inking the floor

`postfx.tune.inkStrength = 0` against base, 1280×720, whole frame, null arm 0 px:

| shot | darkened | mean drop | ≥ 15 L | largest single connected component |
|---|---|---|---|---|
| courtyard | **26.7 %** of the frame | **45.9 L** | 21.0 % | **155 228 px = 80 % of the mask** |
| hero | 15.6 % | 52.3 L | 12.2 % | 45 803 px = 41 % |
| combat | — | — | 12.6 % | 71 871 px = 62 % |
| sly-closeup | 23.4 % | 32.4 L | 14.4 % | 30 338 px = 23 % |

Minimum-chord width, whole frame: **median 10 px, p99 123, max 148** (`courtyard`); **median 42,
p99 133** (`sly-closeup`).

A single connected region covering 17 % of `courtyard`, darkened by a mean of 46 luma, is not a line
system. **This is the critic's 29 px**, and it is an area fill whose extent is set by how steeply a
plane recedes from the camera.

The mechanism was already written down **in the same file**, about a different pass. `slyBackStep`'s
`rimPlanar` gate was added to the *rim* after a critic pass measured exactly this artefact there:

> *"A ground plane running away from a standing camera has an enormous depth gradient: the last few
> pixels before it meets a wall cover tens of metres, so `zMax - z0` clears any threshold set for
> silhouettes … The distinction the pass actually wants is **discontinuity**, not steepness, and
> there is an exact test for it."*

The ink pass never got that gate, and its threshold is **finer** than the rim's (0.030–0.075
relative against 0.05–0.16), so it fires on grazing ground more readily than the term the gate was
written for.

**Fix:** the same second difference of inverse depth — identically zero across any plane at any
grazing angle under a perspective projection — applied to `depthLine`. One deliberate difference
from the rim: the rim keeps only the positive lobe (background falling away behind a silhouette),
ink takes `abs()`, because a concave interior fold is an ink line and a convex silhouette is an ink
line and only a *plane* is neither. Thresholds are `rimPlanar`'s own measured pair, not a new one.
`edgePlanar[2] = 0` restores the old behaviour bit-exactly, which is what the legacy arm below uses.

---

## 3. Mechanism 2 — the depth push displaces the hull; it does not widen it

Raised by the coordinator, reproduced here independently in plain three arithmetic before anything
was changed (`scratchpad/pushrepro.mjs`, now locked as a unit test).

`OUTLINE_VERT` does `mvPosition.z *= 1.0 + uDepthPush` **before** projecting. three's perspective
matrix sets `w_clip = -z_view`, so that scales **w** while `gl_Position.xy` are untouched, and after
the divide the whole shell is pulled toward the frame centre.

| vertex position | hull displacement | ink on the two sides | mean |
|---|---|---|---|
| frame centre | 0.000 px | 2.50 / 2.50 | 2.50 |
| NDC 0.42 | 0.885 px | 1.61 / 3.39 | **2.50** |
| NDC 1.00 | 2.107 px | 0.39 / 4.61 | **2.50** |
| frame corner | 2.418 px | 0.08 / 4.92 | **2.50** |

(1920×1080, fov 46, `depthPush = 0.0022`.)

Two things follow, and the second is why this survived a file whose header is an essay about one
width:

- **The ink offset is exactly preserved** — 2.500000 px at z = −2, −10 and −60, with and without the
  push, because the extrusion is multiplied by `gl_Position.w` and then divided by it.
- **The mean is exactly conserved.** A median or a mean over a silhouette cannot see this at all.
  Only the two sides of one edge, measured separately, show 0.08 px against 4.92 px.

This is a credible source of the critic's **1 px** end. It is ~2 px at the frame corner and exactly
zero at frame centre, so it cannot be the 29 px, and it barely touches a protagonist who sits near
the middle of the frame — the analytic displacement at the staged character is 0.06 px
(`sly-closeup`) to 0.64 px (`temple`).

**Fix:** project the pushed vertex separately and copy only its `ndc.z` into an otherwise unpushed
`gl_Position`. `xy` and `w` are then identical to no push at all, and the depth bias is unchanged
for **any** projection matrix — the `w` ratio is what makes it exact under an orthographic
projection too, where the shipped form's bias is depth-dependent in a different way. Applied as a
string patch in `Outline.js` because `toon.glsl.js` belongs to another agent; the patch throws at
module load if its anchor is gone, and the patched source goes through `tests/shader.test.mjs`'s
static scans and `glslink.mjs`.

---

## 4. Mechanism 3 — the width was resolution-invariant, which is the wrong invariance

`INK_PX = 2.5` was **device pixels at every resolution**. The frame is not a constant number of
pixels: §1 targets 1080p, the critic captures at 1280×720, the harness at 1600×900, a retina display
at quality `high` draws into a 1.5× buffer. The same line is 0.23 % of the frame height at 1080 rows
and 0.69 % at 360.

In `courtyard` Sly is **42 px tall at 1280×720 and 21 px at 640×360**, and the hull is 2.50 px in
both — 6 % of him, then 12 %. The critic's "median ink is 5 px = **6.6 % of his height**" is that
arithmetic and nothing else.

**Fix:** 2.5 px is now the width **at `INK_REF_ROWS = 1080`**, `clamp(2.5 × rows/1080, 0.9, 5.0)`,
driven from `PostFX.render()` once a frame (polling a number already computed every frame, rather
than trusting four different resize events to be forwarded). PostFX's crease radius reads the *same
function*, so the two ink systems cannot drift apart by one being rescaled and the other not.

| rows | 540 | 720 | 900 | **1080** | 1440 | 2160 |
|---|---|---|---|---|---|---|
| hull px | 1.250 | 1.667 | 2.083 | **2.500** | 3.333 | 5.000 |
| share of frame | \-\- constant \-\- | | | | | (clamped at 4K) |

---

## 5. Calibration — including two arms that failed and voided the first run

The first control run **failed two of its three calibrations** and is reported as VOID for those
arms (`ADDENDUM-inkscale-baseline.md`):

- **`nohull` never turned the hull off.** `PostFX._renderChain` calls `endNormalPass()` every frame,
  which sets shell visibility back to `true`, so the poke was overwritten before every capture. The
  hull band came back EMPTY in all four shots *while* `hull2x` reported a band — the only consistent
  reading being that it had measured 2× against 1×. Now hides the ink **materials**.
- **Every 640×360 frame was black.** `setViewportSize` inside a live boot resizes the canvas (the
  drawing-buffer readback confirmed 640×360) and then nothing renders into it. Each resolution now
  gets its own boot.

  Worth recording how that presented: at 640×360 the **null arm PASSED**, because black equals
  black. A null can only ever say "nothing moved". It took the `nochar` arm — which must move
  pixels — to say "nothing *can* move". That is the argument for a positive control next to every
  null, demonstrated on my own instrument.

What survived, and is the foundation of every number above: **the null arm at 1280×720 reported
0 px different and a maximum luma difference of 0.00 in all four shots.** `dt = 0` plus
`renderFrame(0)` genuinely freezes the frame and every lever restored exactly; §220's 3087 px drift
floor is not present in this instrument.

---

## 6. Before/after

<!-- FILLED FROM inkw-after -->

---

## 7. What was deliberately not changed

- **`edgeNearMul/edgeFarMul` (1.8 / 0.70).** §7.3 fails a frame whose outlines are
  "uniform-thickness regardless of depth", so the depth weighting stays. The resolution scale
  already shrinks the radius it multiplies.
- **The rim radii `rimInner/rimMid/rimOuter`**, still in device pixels. Same class of defect, but a
  different term with its own six-shot tuning, and thinning the ink only *improves* the clearance
  the rim's own comment reasons about. Stated so the inconsistency is a decision with a number
  attached rather than an oversight.
- **`AOPass.tune.radius`.** P0 was pre-registered to put a screen-space clamp on the AO radius in
  scope if the AO band's `p99` on the subject exceeded 3× the ink band's in ≥ 2 of 4 shots. It does
  so in **1 of 4** — `courtyard`, where the subject is only 45×44 px and AO gives him a 21 px band
  against ink's 4 px. In `hero` (10 vs 24), `combat` (42 vs 75) and `sly-closeup` (59 vs 136) the
  ink dominates. **P0 does not fire; AO stays out of scope** — but its screen radius is world-space
  (1.35 m ⇒ 33 px in `courtyard`, 377 px in `sly-closeup`) and on a small subject it is the widest
  dark thing next to the silhouette. Recorded as a number for whoever owns it next.

## 8. Test-suite state

`node --test "tests/*.test.mjs"`: **376 of 377 pass.** The single failure is
`textures.test.mjs` — "sandstone_block: the recipe no longer produces the committed cache" — which
predates this work, belongs to §232 ("the cache is deliberately stale"), and cannot be reached from
here: `textures.test.mjs` imports only `src/textures/*`, and this change touches
`src/render/Outline.js` and `src/render/PostFX.js`.

Five new tests, each with a calibration arm that must fail on the shipped model:
constant-fraction-of-frame (the constant-px model spans 4.00× and must fail it), the clamps binding
only where documented, one sync retuning every live material including ones created after it, the
depth push moving nothing in x/y (with the shipped form required to displace 2.107 px), and the
clip-space push being exact under an orthographic projection.

## 9. §186 disclosure

`src/render/Outline.js` (23:20:18) and `src/render/PostFX.js` (23:24:11) were saved while the
`celband` run held the capture lock (23:02:02 → ≤ 23:25:25). Reported to the coordinator at the
time rather than left to be found. Bounded but not zero: with `SANDS_NO_HMR=1` vite sets
`hmr: false` and `watch: { ignored: ['**/*'] }`, so a page that has already imported its modules
cannot pick up a save — only a page **booted** in that window could have compiled the change, and
celband's write-up (§249) landed 58 s after the second save, which is shorter than a boot here. The
reasoning that led me to proceed — `vite.config.js`'s own comment says "agents edit `src/` while
captures run" — was too convenient, and the rule I will follow instead is: lock held ⇒ no save.

# PREREG-inkblack — why the ink line never reaches black, and which of the two ink systems owns it

Registered **before** the candidate capture. Supersedes a VOID run recorded in §5 below.

---

## 1. The defect

Critic 9 D5, measured on `shots/r9`:

| | darkest-decile ink L | frame minimum |
|---|---|---|
| REF-venice | **0.031** | **0.000** |
| every r9 frame | 0.087 – 0.106 | 0.027 – 0.075 |

The critic's own median-ink number is fine (ours 0.12–0.24, reference 0.118). The complaint is
specifically that **the darkest end is lifted ~3x**.

The critic also states a mechanism: *"Cause is almost certainly ordering — the ink is being
fogged/graded rather than composited last."*

---

## 2. What reading the source established, and what it did NOT

There are **two** ink systems, and they are on opposite sides of the tonemap. Any claim about
"the ink" that does not say which one is unfalsifiable.

**HULL ink** — `Outline.js:486`, inverted-hull BackSide geometry, drawn as scene geometry.
`fog: false, toneMapped: false` stops *three's* per-material chunks and nothing else. The hull
writes into the scene buffer, so it goes through the whole of PostFX: exposure 0.95, black lift,
gain, split-tone, saturation 1.30, contrast 1.08 about the pivot, `slyAgX`, `slyLinearToSrgb`.
**The critic's "graded" is CORRECT for this system.**

Its authored colour is `inkSun = 0x1a1210`, `inkShade = 0x161022`, via `new THREE.Color(hex)`,
which under three's colour management is sRGB→linear. Transcribed:

| | sRGB | scene-linear |
|---|---|---|
| `0x1a1210` R | 0.1020 | 0.01033 |
| `0x1a1210` G | 0.0706 | 0.00606 |
| `0x1a1210` B | 0.0627 | 0.00519 |

PostFX's own validated chain table (`src/render/PostFX.js:~605`) puts scene-linear **0.010 at
display L 23.4** with the lift at k=1 and **L 12.3** at k=0; shipped `liftDayScale` is 0.35.
That brackets the measured 0.088–0.116 by the route the critic named.

**CREASE ink** — `PostFX.js:1373`, composited in DISPLAY space after `slyAgX` and after
`slyLinearToSrgb`, i.e. last, clamped `min(ink, c)` so it can only darken.
`uInkStrength = 0.95`, so the composite is `0.95*ink + 0.05*background` — 5% of the lit surface
leaks into every line. It is additionally suppressed where the surface is already dark, by
`line *= smoothstep(0.05, 0.20, lum)`. **The critic's "graded" is WRONG for this system.**

Two further terms act after the ink and were missed on the first reading: `c *= vig`
(`vignette 0.16`) and the FXAA pass. Both can push a composited ink pixel *below* the authored
endpoint, which is why "darker than the ink colour" is not by itself evidence of anything.

**Not established by reading:** which system dominates the measured black point. That is what
this capture is for. Reading the source produced a mechanism story twice today and the first one
was refuted by its own test (§5); the split must be measured, not transcribed.

---

## 3. Instrument

**Definitional ink mask, not a detector.** The VOID run used a ridge detector and could not tell
ink from any dark valley (§5). This run defines the ink as the pixels the ink passes actually
change, which requires no threshold at all:

- **Arm A — shipped.** Both ink systems live.
- **Arm B — crease off.** `postfx.tune.inkStrength = 0`. What remains is hull ink.
- **Arm C — both off.** `inkStrength = 0` **and** the hull suppressed.

Then `inkMask = { p : A(p) != C(p) }` exactly, and `creaseMask = { p : A(p) != B(p) }`,
`hullMask = { p : B(p) != C(p) }`. Frames: all ten of `shots/r9`, same seed, `dt = 0`, one boot,
same resolution. `grain` is already 0.0 so the composite is deterministic per pixel.

**Defeat levers — RESOLVED before any candidate exists (amended 2026-08-09, pre-capture).**

- *Crease.* `postfx.tune.inkStrength = 0`. Live: `PostFX.js:2083` copies `this.tune.inkStrength`
  into the uniform every frame, so the field is read per-frame and needs no rebuild.
- *Hull.* `src/core/Debug.js` carries thirteen levers (`contactQuant`, `contactScale`,
  `fillScale`, `freeCam`, `grainScale`, `hideHud`, `liftScale`, `paused`, `rimClock`,
  `shaftFlare`, `showColliders`, `timeOfDay`, `wireframe`) and **none of them touches the ink**.
  No new lever is added, because none is needed: `buildOutlineShell` (`Outline.js:544`) attaches
  the hull as a **separate `THREE.Mesh`**, named `<mesh>_ink`, held at `mesh.userData.slyShell`,
  carrying a material named `slyInk_<px>@<rows>`. Arm C is therefore a page-side traversal in the
  capture script —
  `scene.traverse(o => { if (o.isMesh && o.material?.name?.startsWith('slyInk_')) o.visible = false; })`
  — which changes no shipped code and so cannot itself perturb arm A.

  **This substitution is only sound if the traversal actually hits every hull.** `_inkMaterials`
  is the authoritative set, so the run must assert `hidden === _inkMaterials.size` worth of
  distinct materials before arm C counts. A traversal that silently matches nothing would make
  arm C identical to arm B, and CAL-2 below is what catches that.

### PREDICTION registered 2026-08-09, from source, BEFORE run-1's numbers exist

The paragraph above worried about the wrong failure. The traversal does hit every hull; what it
cannot do is make the hide **survive to the scene render**, and I found that by reading
`PostFX._renderChain` while run-1 was still queued on the capture lock. Registered here, before
any pixel of run-1 has been scored, so it can fire or fail on the record:

- `_renderChain` renders the **scene first** (step 1, `PostFX.js:1864`) and the **normal prepass
  second** (step 2, `PostFX.js:1888`). The prepass hides the shells for its own duration and its
  `finally` calls `shading.endNormalPass()` (`PostFX.js:1987`) → `setOutlinesVisible(true)`
  (`ToonMaterial.js:1389`), which walks `this._shells` and writes `visible = true` on every one.
- `passes.edge.enabled` and `passes.ao.enabled` are both `true` at construction
  (`PostFX.js:1490`), so `needNormals` is true and that `finally` runs on **every** frame.
- The capture renders **four** frames per arm — `__GAME.step(3, 0)` calls `engine.renderFrame`
  three times (`Debug.js:181`) and then `eng.renderFrame(0)` once more.

**Therefore: the arm-C hide is honoured by the first frame's scene render and reverted before the
second. The captured frame is the fourth. Arm C will be arm B.**

Falsifiable, three ways, and all three are read off run-1's own output:

- **PRED-1** `arm B` and `arm C` are **bit-identical** (equal sha) on all ten shots.
- **PRED-2** consequently `nHull = |B - C| = 0` everywhere and **CAL-2 fails**, so run-1 is
  **VOID** — not FAIL, and P1 says nothing.
- **PRED-3** `nCrease = |A - B|` is **non-zero** on the daylight shots: the crease lever is
  per-frame (`PostFX.js:2083`) and is untouched by this bug, so CAL-1 still passes. A run where
  CAL-1 *also* fails means the harness is broken in some further way and this diagnosis is
  incomplete.

If PRED-1..3 all fire, the mechanism is confirmed by measurement rather than by reading — which
is the distinction §270 says I keep getting wrong — and run-2 may replace the hull lever. **No
threshold moves. CAL-1/2/3, P1, F1, P2 and F2 stand exactly as written.** The only thing run-2
changes is *how the hull is switched off*:

> `o.layers.disableAll()` on each `slyInk_*` mesh, restored with `o.layers.enable(0)`.
> `setOutlinesVisible` writes `.visible` and never touches `.layers`, and three tests
> `camera.layers.test(object.layers)` per object per render, so a layer-hidden shell cannot be
> resurrected by `endNormalPass`. Still page-side; still no shipped-code change.

Run-2 must additionally assert PRED-1's inverse as its own capture-time guard: **arm B and arm C
must differ in sha on every shot**, printed by the capture before the scorer is allowed to run.

### Amendment, same hour, still pre-capture: PRED-1 becomes an ARM, not a separate run

Run-1 was **killed after acquiring the lock and before writing a single frame** (`shots/inkblack`
empty, `arms.json` never written). Nothing was measured, so nothing is being discarded and no
number anywhere in this document comes from it. Two reasons, both stated before any data exists:

1. Spending ten FIFO lock slots — the scarcest resource in this repo — on a run I had just
   finished registering as predicted-VOID is a cost paid by every other agent, not just by me.
2. A separate run is the *weaker* test anyway. Comparing a void run-1 against a live run-2 is a
   cross-boot comparison of two different scripts. Carrying the broken lever as a **fourth arm in
   the same boot** tests the identical claim on the identical frames at the cost of one extra
   render per shot.

So the arms become four, and the prediction is scored inside the run:

| arm | crease | hull defeat | registered expectation |
|---|---|---|---|
| `A-ship` | 0.95 | none | both systems live |
| `B-nocrease` | 0 | none | hull ink only |
| `C0-visible` | 0 | `.visible = false` (**the broken lever**) | **PRED-1: bit-identical to B** |
| `C-noink` | 0 | `.layers.disable(0)` | **must differ from B** |

`layers.disable(0)` rather than `disableAll()`: `Lighting.js:1550-1571` partitions shadow casters
across layers 28/29/30/31 and re-runs that census on a beat, so `disableAll()` would collide with
a system that writes those bits every few frames. Its own comment states the invariant this lever
needs — *"Layer 0 membership is never touched, so the main camera and c0's stock shadow pass are
blind to all of this"* — and the only `camera.layers` writes in `src/` are `Lighting.js:1633` and
`:1679`, both on shadow cameras. The main camera therefore tests layer 0 alone, and clearing
exactly that bit removes the shell from the scene pass and nothing else.

**CAL-4 (MUST FIRE, and it is a sensitivity test, not a null test).** On every shot:
`sha(C0) == sha(B)` **and** `sha(C) != sha(B)`. One lever must be shown dead and the other alive
*in the same boot on the same frame*. If both levers move the frame, PRED-1 is refuted and my
reading of the render order was wrong. If neither moves it, the hull draws no ink at all in that
shot and the attribution question is answered differently than either arm intends. Either way the
run is VOID and says so.

**Nothing else moves.** CAL-1, CAL-2, CAL-3, P1, F1, P2 and F2 are unchanged in wording and in
number. `inkMask`, `creaseMask` and `hullMask` keep their definitions, with arm `C` (the layers
lever) as the un-inked reference; `C0` is scored only by CAL-4 and never enters a mask.

---

## 4. Arms, calibration and falsifiers

### Calibration (MUST FIRE — a null here voids the run)

A null arm proves repeatability, not sensitivity. Both levers must be shown to MOVE:

- **CAL-1** `|A - B|` must be non-empty on every daylight frame: the crease ink is live.
  If any frame shows zero changed pixels, `inkStrength` is not the lever it is documented to be.

  *Provenance of the "daylight" scope, stated rather than buried:* I chose it already knowing
  `night` was the frame that failed the previous instrument, so the timing alone does not make it
  clean. What makes it defensible is that the source predicts it without reference to any
  measurement — the crease ink is multiplied by `smoothstep(0.05, 0.20, lum)`, so a frame whose
  median luma is 0.076 must carry little or no crease ink no matter what the lever does, and
  gating on it would fail the lever for behaving as written. To keep this falsifiable rather than
  merely convenient, `night` is **scored but not gated**, and the exclusion is expressed as a
  prediction: `nCrease(night)` should be under 25% of the daylight median. If night instead shows
  crease ink in daylight quantities, the mechanism argument is wrong, the exclusion was unearned,
  and the scorer says so in those words.
- **CAL-2** `|B - C|` must be non-empty on every frame: the hull ink is live.
- **CAL-3** `inkMask` must cover between 0.5% and 15% of each frame. Outside that band the mask
  is not ink — it is either nothing or the whole picture — and the run is UNSCOREABLE.

### Primary claim, and what would refute it

**CLAIM:** the ink black point is owned by the HULL system, and within it by the authored colour
rather than by the grade's floor.

- **P1** — attribution. Darkest-decile L over `hullMask` in arm B is within **0.010** of
  darkest-decile L over `inkMask` in arm A.
  **F1:** if removing the crease ink moves the darkest decile by **more than 0.010**, the crease
  ink is a material contributor and the "hull dominates" half is refuted.
- **P2** — locus. Re-authoring the hull colour to pure black moves the `hullMask` darkest decile
  down by **>= 0.030 L** (toward the reference's 0.031).
  **F2:** if it moves by **less than 0.010 L**, the wall is the grade chain's own floor and not
  the authored colour, the fix is in the grade, and P2's half of the claim is refuted.
  *(P2 requires a src edit and is a second capture; F2 is registered now so it cannot be moved
  after P1's numbers are seen.)*

### Registered outcomes

`PASS` (both P1 and P2 met) · `SPLIT` (P1 met, P2 refuted — locus is the grade) ·
`FAIL` (P1 refuted) · `VOID` (any calibration arm null) · `UNSCOREABLE` (CAL-3 out of band).

### Not being tested here

The **frame-wide** dark mass — critic 9's "share of frame below L=0.15, ours 1.27–3.64% vs
reference 18.95%". That is the shadow floor (§214.1: `SHADOW_FLOOR x key + fill` puts sandstone
at display L~100 on its own) and it is a lighting-ratio question entangled with the live §269
shadow work. D5 has been read as one defect and is two. This pre-registration covers **only the
ink line's black point**. No number produced here may be quoted about the other half.

Also not in scope: the black lift is already off the hook. `liftDayScale 0.35` landed the
composite's own black floor at **0.66 L** on 2026-08-08 (`790b7e5`), before the r9 frames were
captured on 08-09, so the lift cannot be what is holding the r9 ink at 0.088–0.116.

---

## 5. The VOID run this supersedes — recorded, not deleted

`scratchpad/inkblack.mjs`, run against `shots/r9` before this pre-registration existed. It
claimed the black point was the authored crease-ink endpoint and tested it by solving
`p = (1-t)*bg + t*ink` per channel on ridge-detected pixels, requiring the three channels to
recover the same `t`.

**Outcome: VOID, on its own pre-registered calibration, and refuted on its own primary.**

- **Calibration failed.** On `night.png` the detected "ink" median was **0.117** against a frame
  median of **0.076** — the pixels it found were *brighter* than the frame. The detector was
  finding dark texture valleys, not ink. The calibration was written to fire on exactly this and
  it did.
- **Primary refuted.** Median cross-channel spread in `t` was **0.118** against a registered
  bar of `<= 0.10`, and `t` at p99 ran **1.01–1.34** on eight of ten frames — i.e. pixels darker
  than the authored endpoint at full strength can produce. (Explicable by the vignette and FXAA,
  which act after the ink; but "explicable after the fact" is not the test that was registered.)

Both halves failed, so no number from that run is quoted anywhere in this document as evidence.
The nine frames that passed calibration are **also** discarded: the instrument never established
that what it detected was ink, so passing frames are unsupported by the same argument that
sank `night`.

**The instrument is replaced rather than rescoped.** Dropping `night` and keeping the other nine
would be a post-hoc threshold move (§141.1) — the frame to exclude would have been chosen by
looking at which one failed. The definitional mask in §3 removes the detector entirely, and its
thresholds above are registered before its candidate exists.

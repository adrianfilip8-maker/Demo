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

### P2's remaining under-specifications, closed before P2's capture exists

P2 and F2 fix the *numbers* (>= 0.030 L meets, < 0.010 L refutes) and nothing else. Three things
they leave open, each of which could be settled after the fact in whichever direction suited the
candidate. Closing all three now, with `shots/inkhullcol` not yet created and
`tools/inkhullcol.mjs` holding no data:

1. **Which mask.** The decile is read over the **shipped** hull's mask, `hullMask = { p : B != C }`,
   and *both* arms are measured over that same fixed pixel set. Letting the black-hull arm define
   its own mask would let the candidate choose its own population — the §141.1 failure in spatial
   form, since a hull pixel that stopped differing from the background would silently leave the
   sample and improve the number by shrinking it. `hullMask_D` is computed and printed as a
   diagnostic; it is not what the gate reads.
2. **Which shot.** P2 is scored on the **worst** shot — `min` over the per-shot move, not the
   mean. Critic 9 measured the defect on all ten frames; a candidate that reaches black on eight
   of them has not fixed what was measured.
3. **The gap between the thresholds.** A move of 0.010..0.030 L is registered as **INCONCLUSIVE**
   and is neither P2 nor F2. This is filling a hole the original left open, not moving a
   threshold: 0.030 and 0.010 keep the values they were committed with, and the middle simply
   stops being available to round in whichever direction the result invites.

**Lever change, same class as arm C's.** P2 was registered as needing "a src edit". It does not,
and doing it page-side is strictly safer: `uInkSun` / `uInkShade` are plain uniforms, and the only
thing that rewrites them is `_applyInkNight`, reached through `setInkNight`, which early-outs on an
unchanged amount (`ToonMaterial.js:1620`) — and at `dt = 0` the clock cannot move. So the run
writes the uniforms from the page and changes no shipped byte while measuring (§186). Assumed
levers are what produced the last VOID, so this one is **read back after the render** and
**CAL-P2b** fails the run unless arm D really rendered with `uInkSun == uInkShade == 0` and arm B
did not.

Full P2 calibration, all MUST FIRE: **CAL-P2a** the shipped hullMask is non-empty on every frame ·
**CAL-P2b** the colour override is confirmed applied by read-back · **CAL-P2c** `sha(D) != sha(B)`
on every frame, so the lever is shown to have moved the picture.

### Two numeric predictions, derived and registered before either run has produced a frame

Derived by pushing the authored ink through the project's own validated grade model
(`progress/records/tonecurve.mjs`, whose self-check reproduces the shipped grey-axis row to
0.35 L). That model applies `TUNE.lift` at full strength and exposes no scale, while the shipped
daylight composite runs `lift * liftScale(0.35, dayAmount)` — so the lift is emulated by
pre-inverting the model's own lift term, and the emulation is **validated against both floors the
shipped comment derived by a different route on a different day: 0.66 L at k = 0.35 and 4.58 L at
k = 1, reproduced to 0.01 L**. What the model deliberately excludes: AO, both rims, the crease
pass, bloom, vignette, grain and FXAA. So these are predictions about the GRADE, and the arms are
what settle the rest.

| scene-linear | display L (daylight) |
|---|---|
| hull `inkSun` 0x1a1210 | **0.0375** |
| hull `inkShade` 0x161022 | **0.0445** |
| pure black | **0.0026** |

- **PRED-4 (P2).** The move is predicted at **0.035 – 0.042 L**, i.e. P2 met but inside a factor
  of 1.4 of its own threshold. A result under 0.030 would put the registered threshold on the
  wrong side of a number I derived before running, and INCONCLUSIVE is a live outcome here rather
  than a formality.
- **PRED-5, and it is a warning about how P1 may be read.** The graded hull lands at 0.037–0.045,
  while the crease ink's *display-referred* endpoints are L 0.0767 / 0.0728 and `inkStrength 0.95`
  can only raise a crease pixel off them. Critic 9 measured 0.087–0.106. **The critic's number
  matches the CREASE, not the graded hull** — so the population a ridge detector samples on the
  visible line is probably crease-owned, while the darkest decile of the *union* mask is probably
  hull-owned, because the hull is the darker of the two wherever it exists.

  Both can be true at once, and if they are then **"P1 MET" must not be reported as "the hull owns
  the ink"**. P1 as written is an attribution over the darkest decile of the union mask and
  nothing more. Registered now so it cannot look like an excuse later: whatever P1 returns, the
  result must be reported **alongside `nHull` vs `nCrease` and the crease's own decile**, all
  three of which the scorer already prints, and the hull may be called dominant only if it wins
  on coverage as well as on depth.

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

### G-TREE, added 2026-08-09 after another lane was VOIDed on provenance — a NEW gate, not a moved one

The lead voided the materials lane's run today because its two arms were captured twenty commits
apart and the intervening commits touched `src/core/Shots.js`, so the arms were framed differently
and the scorer said nothing. Four agents commit to this branch continuously.

**G-TREE: every arm of a shot must be rendered from one source tree, verified rather than
assumed.** This can only make the run harder to pass and moves no registered number, which is why
it may be added after the pre-registration and before the score.

The identity is a **content hash of `src/`** (`tools/treestate.mjs`), not a commit sha, and the
distinction is load-bearing here rather than pedantic: vite bundles the **working tree**, and at
the time of writing `src/world/Props.js` and `src/world/Statues.js` are both modified and
uncommitted by other agents. Two captures at the identical commit can therefore render different
pictures, and a sha would report them as the same provenance and be wrong.

**Cross-shot drift is reported, not gated, and the reason is stated rather than assumed.** Every
registered statistic here is computed WITHIN a shot — CAL-1, CAL-2, CAL-4 and P1's per-shot delta
are all one-boot quantities — so drift between shots cannot make any individual number wrong. What
it can do is change *which* shot is worst, so "the worst shot" from a population spanning several
trees is a weaker claim than it looks, and the scorer prints the span.

**Consequence, paid rather than argued around.** Run-2's first four shots (dunes, hero, interior,
courtyard) were captured before provenance recording existed. Their tree is unrecorded, and an
unverifiable guard is VOID, not PASS. Rather than exempt them on the argument that one boot per
shot makes the property true by construction — which is exactly the kind of "true by design"
reasoning this apparatus exists to distrust — those sixteen frames are **moved to
`shots/inkblack-run2a/` and re-captured with provenance**. The CAL-4 shas already recorded in
`RESULT-inkblack.md` stand as the observation they were; the re-capture re-tests them.

### Staleness of every absolute taken from `shots/r9`

Also flagged by the lead: `shots/r9` is now roughly 120 commits old, and another lane found a
registered bar scoring PASS on 1.27 while its own same-run control measured 1.22. Recorded here
without restating anything (§141.1):

- **P1 and F1 are safe.** `|dec(hullMask, B) − dec(inkMask, A)| <= 0.010` is a delta between two
  arms of the same boot. No r9 number enters it.
- **CAL-3's 0.5 %..15 %** is a property of a mask in the frame being scored, not an r9 bar.
- **The r9-derived descriptions are stale and are not thresholds.** "ours 0.087–0.106",
  "p10 median 0.0955", "p90/p10 4.06", "floor lifted 2.01x" all describe a 120-commit-old build.
  They motivate the work; nothing gates on them.
- **`PREREG-inkwiden.md`'s W1/W2 are deltas** between arms of one boot (`S-ship` vs `W-both`), and
  its candidate was sized from the **reference frame** and from constants **parsed out of the
  current source**, neither of which goes stale with r9. Its W3 bounds are geometric.
- **What IS exposed:** any future claim of the form "the ink now matches the reference's 0.0474".
  That compares a new capture against a reference measured with a detector on an old build's
  scale. Such a claim needs a same-run shipped control, and none is registered here.

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

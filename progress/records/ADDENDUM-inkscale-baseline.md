# ADDENDUM to PREREG-inkscale — the baseline run, two VOID arms, and an amended candidate

Written **after the baseline (control) run and before any candidate frame exists**. §141.1 forbids
deriving a criterion after seeing the *candidate*; deriving one from the *control* is what a control
is for. Every threshold changed below is changed here, in advance, with the reason attached.

Baseline: `progress/records/inkw-before/` (one boot, `dt = 0`, FXAA off, ANGLE/SwiftShader,
4 boot warnings).

---

## 1. What passed, what is VOID

| calibration | 1280×720 | 640×360 |
|---|---|---|
| `null` — 0 px against base | **PASS**, 0 px, max 0.00 L, all four shots | PASS (vacuously — see below) |
| `nochar` — > 200 px moved | **PASS** — 1173 / 8939 / 50721 / 117858 px | **FAIL — 0 px** |
| `hull2x` — hull band widens ≥ 1.6× | **FAIL** | **FAIL** |

**The `null` arm is clean at 1280×720 and that is the one result worth keeping from it.** Four shots,
zero pixels different between the first and last capture of a block, maximum luma difference
0.00 — so `dt = 0` plus `renderFrame(0)` genuinely freezes the frame, every lever restored exactly,
and §220's 3087 px drift floor is not present in this instrument. Every 1280×720 number below sits
on that.

### VOID 1 — the `nohull` arm never turned the hull off

The hull band is **EMPTY in all four shots**, while `hull2x` (2× thickness against `nohull`) produced
a band with a median chord of 3 px. Those two facts are only consistent one way: `nohull` and `base`
are the same image, i.e. the lever did nothing, and `hull2x` measured 2× against 1× rather than 1×
against 0×.

Cause, found by reading rather than guessing: `PostFX._renderChain` calls
`shading.beginNormalPass()` → `setOutlinesVisible(false)` and `endNormalPass()` →
`setOutlinesVisible(**true**)` on **every frame**. The instrument's poke is overwritten by the next
render, before the capture. This is §218's lesson arriving in a new shape — the poke path was live
(the `nochar` arm proves it), but *this particular lever* is not a lever.

Fix: hide the ink **materials** (`material.visible = false`), which `WebGLRenderer.projectObject`
honours and which nothing in the frame loop rewrites. **No hull number is quoted anywhere until that
re-runs.**

### VOID 2 — every 640×360 frame is black

All 32 frames at 640×360 read **exactly 0 in every channel**. `page.setViewportSize` inside a live
boot resizes the canvas and the drawing buffer (the run logged `drawing buffer 640x360`, so the
resize itself took), but nothing renders into it afterwards. Not investigated further: the fix is to
give each resolution its own `withGame` boot, which is the harness's known-good path — the browser
context is created at that viewport and the game boots into it.

Note the trap this leaves for anyone reading the raw log: at 640×360 the `null` arm reports **0 px
different and therefore PASSES**, because black equals black. A null arm can only ever say "nothing
moved"; it takes the `nochar` arm to say "something *can* move", and that is exactly why both are
required. Here `nochar` reported 0 and caught it.

---

## 2. What the surviving arms found — and it is not a width problem

`noink` (`postfx.tune.inkStrength = 0`) against `base`, 1280×720, whole frame:

| shot | pixels the ink pass darkened | mean drop | ≥ 15 L | largest single connected blob |
|---|---|---|---|---|
| courtyard | 246 267 = **26.7 %** of the frame | **45.9 L** | 21.0 % | **155 228 px = 80 % of the mask** |
| hero | — = 15.6 % | 52.3 L | 12.2 % | 45 803 px = 41 % |
| combat | — | — | 12.6 % | 71 871 px = 62 % |
| sly-closeup | — = 23.4 % | 32.4 L | 14.4 % | 30 338 px = 23 % |

Minimum-chord width of that mask, whole frame: **median 10 px, p99 123 px, max 148 px** (courtyard);
**median 42 px, p99 133 px** (sly-closeup). On the subject box: median 11 px, p99 136 px.

**The screen-space crease pass is not drawing lines.** In `courtyard` a single connected region of
155 228 pixels — 17 % of the whole frame — is darkened by a mean of 46 luma. A line system cannot
produce that, and no minimum chord of 123 px is a line.

The mechanism is named, in detail, in a comment **in this same file**, about a different pass:

> *"A ground plane running away from a standing camera has an enormous depth gradient: the last few
> pixels before it meets a wall cover tens of metres, so `zMax - z0` clears any threshold set for
> silhouettes and this pass rims the contact. … The distinction the pass actually wants is
> **discontinuity**, not steepness, and there is an exact test for it. Under a perspective
> projection, INVERSE depth is an affine function of screen position across any plane — so
> `1/a + 1/b - 2/z0` is identically zero on a plane at any grazing angle whatsoever."*

That is `slyBackStep`'s `rimPlanar` gate, added to the **rim** after a critic pass measured exactly
this artefact there. The **ink** pass has no such gate, and its depth threshold is *finer* than the
rim's (0.030–0.075 relative, against the rim's 0.05–0.16), so it fires on grazing ground more
readily than the term the gate was written for. The occupancy maps put the dense mass on the ground
in every shot.

So the critic's "1 px → 29 px, tracks depth-discontinuity magnitude" is, in its 29 px half, this:
not a wide *line*, but an *area* fill whose extent is set by how steeply a plane recedes.

---

## 3. Amended candidate

Items 1–4 of PREREG §4 stand unchanged. Added:

**5. `PostFX.js` — a planarity gate on the crease pass's depth term**, the same second difference of
inverse depth `slyBackStep` already uses, with one deliberate difference: the rim keeps only the
**positive** lobe (background falling away behind a silhouette), while ink must keep **both** — a
concave interior fold is an ink line and a convex silhouette is an ink line, and only a *plane*
(bend ≈ 0) is neither. So the ink gate takes `abs(bend)`.

Thresholds are **not newly invented**: `edgePlanar: [0.04, 0.20, 1.0]` reuses the pair `rimPlanar`
already carries, measured on six shots in this file, evaluated on the same buffer at radii of the
same order. The third entry is the gate strength; **0 restores the current behaviour bit-exactly**,
so the gate is A/B-able in one boot.

Item 5 of PREREG §5 (things deliberately not changed) is unchanged: `edgeNearMul/edgeFarMul`, the
rim radii and `AOPass.tune.radius` are still not touched.

---

## 4. Amended thresholds

**P3 is replaced.** The old form — ink mask count within `[0.55, 1.20] ×` baseline — was written on
the assumption that the ink mask *is* the line, and it is not: the candidate deliberately removes an
area fill, so the old P3 would fail by construction on a working fix. Replaced by a test of what a
line *is*, which is what should have been asked in the first place:

- **P3a — the ink is a LINE.** Combined ink band, whole frame: **median minimum chord ≤ 4 px** and
  **p99 ≤ 14 px**, in every shot. Baseline: median 10 / p99 123 (courtyard), median 42 / p99 133
  (sly-closeup).
- **P3b — the ink still exists.** Combined ink mask pixel count ≥ **10 %** of baseline frame-wide and
  ≥ **35 %** of baseline on the subject, in every shot. Below that the fix has deleted the ink
  system rather than confined it, which is §7.3's "outlines missing".
- **P3c — no blob.** The largest connected component of the ≥ 15 L ink mask must be ≤ **25 %** of the
  mask in every shot, against a baseline of 80 / 41 / 62 / 23 %.

**P1, P2, P4 stand**, with P1 and P4 now resting on a hull arm that has never yet produced a number —
so they are, correctly, still untested.

**P5 (`nochar`) is now load-bearing at both resolutions** and a 0 px reading is a FAIL, not a pass.

---

## 5. Instrument changes, made before the candidate run

1. `nohull` hides the ink **materials**, not the shells.
2. Each resolution gets its own `withGame` boot.
3. `hull2x` pokes `material.userData.slyInkScale` as well as the uniform, so the same arm works
   before the fix (where nothing rewrites `uThickness`) and after it (where the per-frame resolution
   sync does).
4. The largest-connected-component statistic (P3c) and the ink-band ring statistic (P4) are computed
   by the same analyser over both runs; `--analyse` re-runs the analysis over frames already on disk
   so the before arm and the after arm can never go through different code.

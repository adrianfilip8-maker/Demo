# RESULT — decalsign: the contact decals never multiplied at all

Seal: `PREREG-decalsign.md`, committed **unmodified** at `81d1540`, 2026-08-08 21:11:04 UTC, before
any candidate frame existed. It was swept into another agent's `git add -A`; `git diff 81d1540 --
progress/records/PREREG-decalsign.md` is empty, so the bands scored below are the bands that were
sealed. §141.1 is satisfied by the git history rather than by my assertion.

See KNOWN_ISSUES §252. Instrument `progress/records/decalsign.mjs`; frames and `report.json` in
`progress/records/decalsign/`. One boot, `courtyard`, 1280×720, quality `high`.

Texture cache frozen at the EGYPT agent's 21:24:23 bake, before this run's lock acquisition — so no
arm in this run straddles a texture change. Recorded because CR-2 is a §224 side-effect check and
would be worthless if the textures had moved underneath it.

---

## 1. Mechanism — read out of `three`, not inferred from pixels

`src/world/Decals.js` built the contact material with `blending: THREE.MultiplyBlending` and no
`premultipliedAlpha`, so it shipped `false` (the `Material` default).

`three@0.185.1`, `build/three.module.js:10251` `setBlending()`, `premultipliedAlpha === false`:

```js
case MultiplyBlending:
    error( 'WebGLState: MultiplyBlending requires material.premultipliedAlpha = true' );
    break;
```

**There is no non-premultiplied multiply path in three at all.** The branch logs and returns
*without calling `gl.blendFunc`*. It then records `currentBlending = MultiplyBlending`,
`currentPremultipledAlpha = false` and nulls the cached factors, so on every subsequent frame

```js
if ( blending !== currentBlending || premultipliedAlpha !== currentPremultipledAlpha )
```

is false and the switch never runs again. The decal was drawn under **whatever function the
previously-programmed material had left in the context**. Opaque materials do not reset it —
`setBlending(NoBlending)` returns early after `disable(gl.BLEND)` without touching `currentBlending`
or the factors — so the inherited function comes from the last *transparent* draw before
`renderOrder 6`, which `Sky.js:732` puts at the birds' `renderOrder 5`.

That is what makes this a brightening rather than a wrong shade. `FRAG` emits a MULTIPLIER, not a
colour:

```glsl
gl_FragColor = vec4( mix( vec3( 1.0 ), uTint, a ), 1.0 );
```

| band | `a` | `S` luma | `F·S` (multiply) | `S` (replace) | `F+S` (additive) |
|---|---|---|---|---|---|
| rim | 0.00 | **1.000** | `F` | `1.000` | `F + 1.000` |
| skirt | 0.48 | 0.665 | `0.665 · F` | `0.665` | `F + 0.665` |
| core | 0.80 | 0.442 | `0.442 · F` | `0.442` | `F + 0.442` |

Under `dst · src` the rim is a no-op and the core is a shadow. Under **anything else** the rim is
white — the decal paints its brightest value at its own outer edge and gets darker toward the middle
where the prop hides it. A halo growing outward from the base: the same profile §226 measured round
the KayKit props before the decals existed (floor peaking **5 px outside** the silhouette, +2.06 L
pooled, +12.91 L peak), and what the pass-8 critic scored as "the contact shadow is INVERTED".

---

## 2. The change

One line in `src/world/Decals.js`: `premultipliedAlpha: true`.

three then programs `blendFuncSeparate( DST_COLOR, ONE_MINUS_SRC_ALPHA, ZERO, ONE )`. `FRAG` writes
`a = 1.0` unconditionally, so `ONE_MINUS_SRC_ALPHA` is zero and the RGB result is exactly
`src × dst`, destination alpha untouched. A colour whose alpha is 1 *is* its own premultiplication —
the flag names the blend equation here and says nothing about any stored colour. If `FRAG` ever
stops writing 1.0 the two lines have to move together, which the new test asserts.

**Rejected alternative, recorded in the seal before measurement:** `CustomBlending` with
`blendSrc = ZeroFactor, blendDst = SrcColorFactor` computes the same product and never warns,
because `CustomBlending` skips the warning branch. Rejected because it would fix the pixels while
leaving the boot warning standing, and that warning was the only thing in the build pointing at the
defect.

**Not the §224 flag.** §224 is `premultiplyAlpha` on a *texture* round-tripped through a 2D canvas —
57 % of `torch_flame`'s bytes wrong, ±184 on red. Different flag, different object; the contact
material has no map of any kind. The project already had both halves right elsewhere and simply
missed this one: `Textures.js:593` sets `t.premultiplyAlpha = false` on textures, and
`Guard.js:1212` sets `premultipliedAlpha: true` on a material for exactly this class of reason
("or three blends with (SRC_ALPHA, ONE) and the beam lands as colour × alpha²"). CR-2 measures the
frame outside the decals rather than asserting the distinction.

---

## 3. Arms

| arm | configuration |
|---|---|
| CLEAN | the material as the tree ships it — console window for CR-3, GL readback for CAL-3 |
| A1 | `premultipliedAlpha = false` — today's shipped material, bit-for-bit; runs first |
| A2 | `premultipliedAlpha = true` — the fix |
| A3 | A2 again — the §220 null arm |
| A4 | `debug.decalScale = 0` — a true off arm (strength exactly 0 *and* `mesh.visible = false`) |
| CAL-1 | synthetic multiply over a known grey, in the game's own GL context |

Masks from the real instanced attributes, the real uniforms and the live camera, by running the JS
mirror of `VERT` over the disc's outer ring — never a guessed screen position.

---

## 4. Calibration — every arm fired. Nothing below would count otherwise.

| arm | requirement | measured | |
|---|---|---|---|
| **CAL-1** synthetic multiply over known grey | `right ≤ left − 20` | left **55.00**, right **24.08**, **Δ −30.92** | **FIRES** |
| **CAL-2** projection finds the decals | `N ≥ 500` px in FOOT moved by turning decals off | **15 594** (A2), 17 902 (A1) | **FIRES** |
| **CAL-3** the fix reaches the GPU | A2 reads `DST_COLOR / ONE_MINUS_SRC_ALPHA / ZERO / ONE` | exactly that, 36 draws | **FIRES** |
| **CAL-3** not COLLAPSED | A1 ≠ A2 readback | A1 `SRC_ALPHA / ONE_MINUS_SRC_ALPHA / ONE / ONE_MINUS_SRC_ALPHA` | **distinct** |
| **CAL-4** the warning check can see a warning | warning must appear while A1 renders | **true** (20 console errors); **false** on A2 | **FIRES** |
| **NULL** readability | `|MED_NULL| ≤ 0.5` | **0.00** (p90 1.64) | **PASS** |
| **NOT-COMPARABLE** gate | mask describes the real decals | worst world-centre disagreement **0.0066 m** | **COMPARABLE** |

`CAL-1`'s `premulFalse` sub-arm returned **byte-identical numbers and an identical blend readback**
to `premulTrue`. That was predicted in §7 before the run and it is the mechanism on display: the
only way a non-premultiplied multiply reproduces a correct multiply exactly is by programming
nothing and inheriting the function the previous draw left.

---

## 5. Results

Primary: median over FOOT of `(arm − A4 OFF)`, n = 27 979 px, `courtyard`, 1280×720.

| arm | median | mean | SEM | p10 | p90 | band | verdict |
|---|---|---|---|---|---|---|---|
| **A1 BROKEN** (ships today) | **+11.28** | **+42.29** | 0.279 | −0.29 | +110.74 | reported, not gated | brightens |
| **A2 FIXED** | **−3.09** | **−8.55** | 0.063 | −28.41 | 0.00 | `≤ −2.0` | **PASS — darkens** |
| **A3 FIXED′** | −4.58 | −9.11 | 0.062 | −28.41 | 0.00 | — | same sign |
| **NULL** A2−A3 | 0.00 | +0.57 | 0.013 | 0.00 | +1.71 | `|med| ≤ 0.5` | **PASS** |

**CR-1 rim** (`≤ 0` required): **A2 −3.79**, against **A1 +49.82** — PASS. The rim is where a broken
multiply is brightest and it is now a no-op, which is the specific thing the counter-risk was
written to catch.

**Critic-form halo**, mean L inside the decal minus mean L just outside it (`< 0` required for A2):

| arm | inside | outside | halo |
|---|---|---|---|
| A1 BROKEN | 145.47 | 83.18 | **+62.29** |
| A2 FIXED | 56.84 | 83.69 | **−26.85** — PASS |
| A4 no decal | 72.07 | 84.19 | −12.12 |

Against A4 the decal's own contribution is **−14.7 L** (fixed) against **+74.4 L** (broken).

**CR-2 side effects / §224** (`PX_FAR ≤ 2 × PX_NULL`): far-field pixels moved by the fix
**97 371**, against the null arm's own far-field churn of **131 485** — the change outside the
decals is *smaller than the frame's own drift*, so there is no detectable texture-colour side
effect. PASS.

**CR-3 the boot warning**: `bootWarningPresent: false` at the clean boot, with CAL-4 proving the
listener works. PASS. **The warning is gone.**

### 5.1 What the broken decal was actually doing — and my first statement of it was wrong

I wrote at first that the broken decal "adds light". It does not, and the per-decal split exposed
it: A1's median is positive on only 6 of 17 measurable footprints. Binning every touched footprint
pixel by the floor's *own* luma with no decal present:

| floor luma (A4) | n | A1 BROKEN Δ | A2 FIXED Δ |
|---|---|---|---|
| 29 | 1 219 | +13.9 | −1.9 |
| 50 | 2 744 | **+103.5** | −12.1 |
| 71 | 10 083 | **+87.9** | −15.0 |
| 86 | 2 493 | **+71.0** | −11.8 |
| 110 | 1 123 | **−0.3** | −3.7 |
| 126 | 452 | +41.4 | −12.1 |

A1's brightening **falls as the floor brightens and crosses zero near luma 110**. That is the
signature of **replacement**, not addition (which would be a constant offset) and not multiplication
(which would scale with the floor). With `srcAlpha = 1.0` under the inherited
`SRC_ALPHA / ONE_MINUS_SRC_ALPHA`, `result = src`: the decal **overwrote** the floor with its own
multiplier. So the defect was worse than a sign error — inside every contact the paving's texture,
grout and colour variation were **destroyed and replaced by a flat value**, which is exactly the
property §2.1.3 chose a multiply to preserve. The `+11 L` median is a by-product of most of this
frame's floor being darker than that value. A2 darkens in **every** bin.

The 126 bin is an exception at +41.4 on n = 452 and is flagged rather than smoothed away: most
likely rim pixels, where `a = 0` makes the replacement value white.

### 5.2 Precision — what "matches" means here, stated because I got it wrong once

**The A2/A3 null is not byte-identical, and I first described it as if it were.** At frame level the
two identical arms differ on **51.97 %** of pixels, mean |Δ| 3.85, max 193 (coordinator's hashes;
my own `PX_NULL` at a >2 L threshold is 144 258 px). What matched was the CAL-3 readback and the
draw count, not the pixels, and the first version of this claim did not say which.

Cause, in my own source: `decalsign.mjs:362` calls `setShot(n)` **without `{ dt: 0 }`**, so each arm
advances `engine.time` by ~0.28 s across its 17 settle frames, and every clock-driven effect moves.
`celband` froze the clock and earned a byte-identical null; this run did not. §233/§243's point
holds — the drift floor is a property of the pair, not a constant of the project. This is an
instrument defect of mine and it is one of §251's 32-of-59.

**The ROI statistic survives it, and here is the check rather than the assertion.** Per-pixel noise
averages down as 1/√N *only if it is zero-mean*, and over the raw FOOT mask **it is not**: the null's
ROI mean is +0.568 with SEM 0.013, i.e. **43.9 SEM from zero**. My analysis script says so in those
words rather than assuming. Restricted to pixels the null pair itself calls stable
(`|A2 − A3| ≤ 2`, 90.9 % of FOOT — a mask derived from a control, never from a subject), the bias
falls to **+0.186** and the subject numbers barely move: A2 −8.98, A1 +43.74. So the effect is
**15–47× the residual bias and opposite in sign to it**, and the conclusion does not depend on the
contaminated pixels.

The honest effect size is therefore a range, not a point: **A2 mean −8.55, A3 mean −9.11**, and the
0.57 L gap between two identical arms *is exactly the null's ROI mean* — an arithmetic identity that
serves as a self-check. Quoting a single figure to three decimals would be false precision.

### 5.3 Where the result comes from

Of 82 projected footprints, **31** carry ≥ 40 px and **17** are actually reached by the decal; 14 are
dead (off-screen or wholly occluded) and contribute exact zeros that dilute the median toward 0 —
so **−3.09 is a conservative estimate**. A2 darkens **12 of 17**. Three footprints hold 21 783 of
27 979 FOOT px (78 %) and all three show the predicted pattern strongly: `#33 kaykit` A1 +82.3 /
A2 −12.9, `#29 props` A1 +53.7 / A2 −12.5, `#5 props` A1 +37.6 / A2 −4.2. The far, small decals
return nothing measurable, which is consistent with the feature's own premise — at `courtyard`'s far
field a decal is ~20 px across.

**`?kaykit` was live in this boot** (36 draws = 2 meshes × 18 frames; 82 footprints = 46 props + 36
KayKit), so the showcase decals are included. Same class, same material, same fix.

---

## 6. Out of scope, stated so it is not miscredited

**The critic's +5.5 L under Sly's boots is not this decal and this fix does not touch it.** The
player is not a `ContactDecals` client — `Props.js:212` and `KayKit.js:286` are the only two `add()`
call sites and both are props. Only `_courtyardDress`, `_hallDress` and `_brazier` are grounded, all
on fixed-height paving, so the projection does not depend on `tools/lvl.mjs`'s missing terrain.
Through the shipped `sly-closeup` camera his feet land at (640, 610) px at 1280×720 and **the nearest
contact decal in that frame is 377 px away**. Whatever brightens the floor under his boots belongs
to the screen-space contact term — which §226 had already measured misbehaving in the same
direction. Logged by the coordinator as a separate orphaned defect.

---

## 7. Instrument caveats, stated rather than discovered later

**CAL-1's `premulFalse` sub-arm is not authoritative and was never the gate.** It runs *after*
`premulTrue` in the same GL context, so it inherits the multiply function `premulTrue` just
programmed. The gate is `premulTrue` (a guaranteed multiply over a known grey, which must darken by
≥ 20 L). If the two sub-arms return identical numbers *and* an identical `gl.BLEND_SRC_RGB`
readback, that is itself the mechanism on display — the only way a non-premultiplied multiply
reproduces a correct multiply is by programming nothing and inheriting everything. The authoritative
"what does the shipped decal inherit" number is **A1's probe**, read inside the decal mesh's own
`onAfterRender` in the real frame.

**The seal's NOT-COMPARABLE gate is scored in world metres, not screen pixels**
(`decalsign-check.mjs`). The in-page number is the projected polygon's *centroid*, which the vertex
shader has already pushed `reach * uPush` downwind; the offline number is the instance *centre*.
Comparing those in pixels would compare two different quantities and would fail on a correct build.
World centres are the same quantity in both and are what the mask derives from. This is a correction
to how the gate is computed, not a loosening of it — the threshold is unchanged and was not touched
after seeing any subject number.

---

## 8. Observed, not fixed here

The contact material is `transparent: true` + `side: DoubleSide` with `forceSinglePass` left at its
default `false`, so `WebGLRenderer.renderObject` (`three.module.js:18127`) draws the batch **twice
per frame** — once `BackSide`, once `FrontSide` — setting `material.needsUpdate = true` on each
pass. The two passes cannot both rasterise (the disc is coplanar and single-winding, so one is fully
culled), so this is **not** a double-multiply and is no part of the sign defect; it is a wasted draw
call and a per-frame program lookup. `Guard.js:1279` already carries `forceSinglePass: true` with
the reasoning. Deliberately left alone: it is an unmeasured change, and bundling it into a measured
one is how two results become one unfalsifiable story.

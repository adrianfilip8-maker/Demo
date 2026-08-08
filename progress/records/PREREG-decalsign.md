# PREREG — decalsign: the contact decals brighten the floor instead of darkening it

**Sealed before any candidate frame is captured.** DECALS agent, files `src/world/Decals.js`,
`src/world/Props.js`, `src/world/KayKit.js`. Tree at sealing: `da890a3`
(*"critic pass 8: 3/10 blind"*), working tree clean in my three files.

§141.1: every band below is fixed here, before the fix is written and before any arm is run.
Nothing in this file may be re-derived after a number is seen. If a criterion turns out to be
mis-derived the run is VOID and I say so.

---

## 1. The finding

Blind critic, pass 8, `da890a3`:

> The contact shadow is INVERTED: floor under his boots is **+5.5 luma** brighter than floor
> 250 px away, and the vase decal is **+2.9** brighter. The decals landed; their sign is wrong.

and, in the boot log since the decals landed (§226's closing paragraph):

```
THREE.WebGLState: MultiplyBlending requires material.premultipliedAlpha = true
```

---

## 2. Mechanism, read out of source rather than guessed

`src/world/Decals.js:396` builds the contact material with `blending: THREE.MultiplyBlending`
and no `premultipliedAlpha`, so the material ships `premultipliedAlpha === false` (the
`Material` default).

`three@0.185.1`, `build/three.module.js:10251` `setBlending()`, the `premultipliedAlpha === false`
branch (lines 10310–10340):

```js
case MultiplyBlending:
    error( 'WebGLState: MultiplyBlending requires material.premultipliedAlpha = true' );
    break;
```

**That branch logs and returns without calling `gl.blendFunc` at all.** It then records
`currentBlending = MultiplyBlending`, `currentPremultipledAlpha = false` and nulls the cached
factors, so on every subsequent frame the guard
`blending !== currentBlending || premultipliedAlpha !== currentPremultipledAlpha` is false and the
switch is skipped entirely.

Consequence, stated as a prediction rather than as a result: **the contact decal is drawn with
whatever blend function the previously-programmed material left in the GL context.** Its own
fragment output is a *multiplier* — `mix(vec3(1.0), uTint, a)` with `a ∈ [0, 0.8]`, i.e. a value
that runs from **1.0 (white) at the rim to ~0.44 luma at the core** — so under any blend function
that is not `dst × src` that value composites as *light added or painted*, brightest exactly at
the outer rim of the decal. A halo, growing toward the edge. That is the shape the critic
reported and it is the shape §226 already recorded round KayKit props (`+2.06 L` pooled,
`+12.91 L` peak, floor *peaking 5 px outside* the silhouette).

`src/render/Sky.js:732` puts the birds at `renderOrder = 5` and `src/world/Decals.js:408` puts the
contact batch at `6`, so the inherited function is most likely the birds'. **This is a guess and
is scored as one** — arm CAL-3 below reads the actual `gl.BLEND_SRC_RGB` / `gl.BLEND_DST_RGB` at
the decal's own draw call and reports it, so the run does not have to rely on it.

### 2.1 The boots are not mine, and I am saying so before I measure

Projected offline through the shipped `sly-closeup` camera (`scratchpad/decalwhere.mjs`, exact
projection of every queued `Props` decal centre): the player stands at `(0, 0, 30)`, his feet
project to `(640, 610)` px at 1280×720, and **the nearest contact decal in that frame is 377 px
away**. There is no contact decal under Sly's boots in `sly-closeup`, in `hero`, in `courtyard`,
in `temple` or in `combat` — the player is not a `ContactDecals` client at all
(`Props.js:212` and `KayKit.js:286` are the only two `add()` call sites, and both are props).

**So the critic's `+5.5 L` under the boots cannot be fixed by anything in this seal**, and a
result that closes it would be a result crediting my fix with someone else's. What this run can
own is the `+2.9 L` vase number and the sign of the decal's own contribution. The boots number is
re-asserted here as OUT OF SCOPE and will be repeated in the RESULT.

The offline projection is re-run **in-page against the built geometry and the live camera** during
the capture (exact instanced attributes, real terrain heights, which `tools/lvl.mjs` cannot give),
and the run reports NOT COMPARABLE rather than a number if the two disagree by more than 4 px.

---

## 3. The fix under test, sealed before it is written

`premultipliedAlpha: true` on the contact material, `blending` left at `MultiplyBlending`.

In `three@0.185.1` that programs
`gl.blendFuncSeparate( DST_COLOR, ONE_MINUS_SRC_ALPHA, ZERO, ONE )`. `FRAG` writes
`gl_FragColor.a = 1.0` unconditionally, so `ONE_MINUS_SRC_ALPHA = 0` and the RGB result is
exactly `src × dst` — the multiply the shader was written for — while the destination alpha is
left untouched. A colour whose alpha is 1 *is* its own premultiplication, so the flag is a
statement about the blend equation here and not about any stored colour.

**§224 is the trap this must not walk into.** §224 is about *texture bytes*: `premultiplyAlpha`
on a 2D canvas round-trip destroyed 57 % of `torch_flame`'s bytes, ±184 on red. That is a
different flag on a different object. Nothing in this fix touches `Texture.premultiplyAlpha`, any
canvas, or any texture at all — the contact material has **no map of any kind**. Counter-risk
CR-2 below measures the frame outside the decals anyway rather than asserting it.

**Rejected alternative, recorded so it is not re-litigated:** `CustomBlending` with
`blendSrc = ZeroFactor, blendDst = SrcColorFactor` computes the same product and never warns,
because `CustomBlending` skips the warning branch entirely. It is rejected because it would leave
the boot warning standing while silently fixing the pixels, which is the worse of the two
outcomes — the warning is the only thing in the build that currently points at this defect.

---

## 4. Instrument

One boot, `courtyard`, 1280×720, quality `high`. `courtyard` because it holds **35 in-frame
contact decals at 11–70 m** — the most of any canonical shot and the far field the feature was
built for — and because it is one of the four frames the critic scores.

Four arms, in this order, all through `__GAME.setShot()` so each is a forced render (§218):

| arm | configuration |
|---|---|
| **A1 BROKEN** | `material.premultipliedAlpha = false` — bit-for-bit today's shipped material. Runs FIRST, before anything in the session has ever programmed a multiply, so the inherited GL state is the shipped build's. |
| **A2 FIXED** | `premultipliedAlpha = true` |
| **A3 FIXED′** | identical to A2 — the §220 null arm |
| **A4 OFF** | `debug.decalScale = 0` (a true off arm: strength exactly 0 *and* `mesh.visible = false`) |

Both `ContactDecals` instances (`props` and `kaykit`) are set together on every arm.

Masks, computed in-page from the real instanced attributes, the real uniforms and the real camera
by running the JS mirror of `VERT` over the disc rings:

- **FOOT** — the union of every instance's projected outer ring (`alpha = 0` rim), i.e. the decal's
  total screen footprint.
- **OUT** — an annulus from 1.5× to 3.0× the outer radius about each centre, minus every
  instance's FOOT. The "floor just outside" of the critic's own phrasing.
- **FAR** — everything more than 8 px outside every FOOT. Used only by CR-2.

Luma is the critic's: `L = 0.2126R + 0.7152G + 0.0722B` on the 8-bit sRGB frame.

More than half of FOOT is un-occluded ground **by construction** — `TUNE.spread = 1.42` puts
`1 − (1/1.42)² = 50.4 %` of the disc outside the prop's own footprint before the downwind reach
is counted — so the median over FOOT is a ground pixel and needs no occlusion mask. Stated here
because it is the assumption the primary statistic rests on.

---

## 5. Calibration arms. Every one MUST fire; if any does not, the instrument is blind and no
subject number in this run means anything.

**CAL-1 — synthetic multiply, known sign.** An offscreen 64×64 render, in the game's own WebGL
context: a flat quad at a known mid-grey, then the *shipped* contact `ShaderMaterial` (same
`uTint`, same `uStrength`) with `premultipliedAlpha = true` covering the right half only.
**MUST FIRE: `L(right) ≤ L(left) − 20`.** This is the positive control the brief asks for — a
synthetic case where the shadow is known to darken. If a guaranteed multiply over a known
background does not darken by 20 luma, nothing downstream is readable.
Reported alongside, not gating: the same synthetic with `premultipliedAlpha = false`, plus the
blend function actually programmed in each case.

**CAL-2 — the projection finds the decals.** `N = |{ p ∈ FOOT : |L_A2(p) − L_A4(p)| > 2 }|`.
**MUST FIRE: `N ≥ 500`** at 1280×720. If turning the decals off changes almost nothing inside the
footprint I computed, my projection is wrong and every masked statistic is measuring bare floor.

**CAL-3 — the fix reaches the GPU.** Read `gl.BLEND_SRC_RGB` / `gl.BLEND_DST_RGB` /
`gl.BLEND_SRC_ALPHA` / `gl.BLEND_DST_ALPHA` inside the decal mesh's own `onAfterRender`, per arm.
**MUST FIRE: A2 reports `DST_COLOR / ONE_MINUS_SRC_ALPHA / ZERO / ONE`.** §40: a lever read back
from its own source of truth cannot report that it failed to arrive, so this reads the GL context
and not `material.premultipliedAlpha`. An arm whose readback equals another arm's is COLLAPSED and
scores nothing.

**CAL-4 — the warning check can see a warning.** The console error text
`MultiplyBlending requires material.premultipliedAlpha = true` **MUST appear** while arm A1 is
rendering. A boot log that is clean because the listener is broken is not a boot log that is clean.

**NULL (§220).** `MED_NULL = median over FOOT of (L_A2 − L_A3)`, and `PX_NULL` = count of
whole-frame pixels differing by more than 2 L between A2 and A3. §220's floor is 3087/57600 px on
a 4-frame gap; these arms are a full `setShot` apart, so `PX_NULL` is expected to be larger and
is the only drift number this run is allowed to compare against.
**The run is readable only if `|MED_NULL| ≤ 0.5`.**

---

## 6. Bands, pre-registered

Primary statistic, per arm X: `MED_X = median over FOOT of ( L_X − L_A4 )` — the signed
contribution of the decal itself, against the same frame with no decal in it.

**PRIMARY — SIGN.**
- **FIXED** — `MED_A2 ≤ −2.0` (≥ 4× the null ceiling). The decal darkens.
- **NULL** — `−2.0 < MED_A2 < +2.0`. The decal does not reach the frame; the fix is not
  demonstrated whatever CAL-3 says.
- **FAILED** — `MED_A2 ≥ +2.0`. Still brightening; `premultipliedAlpha` was not the mechanism and
  the seal was wrong.

**SECONDARY — what ships today.** `MED_A1` is *reported, not gated*, and all three outcomes are
named in advance so none of them can be presented as a surprise:
- `MED_A1 ≥ +2.0` — brightening, the critic's finding reproduced on my own instrument.
- `|MED_A1| < 2.0` **with `N_A1 = |{p ∈ FOOT : |L_A1 − L_A4| > 2}| < 500`** — the inherited blend
  function is swallowing the draw and **the shipped decals are invisible**, in which case the
  critic's `+2.9 L` is §226's pre-existing screen-space halo and not mine. This outcome is
  pre-registered because it is a live possibility (the inherited function is not knowable from
  source) and I will not be able to claim afterwards that I expected only the other one.
- `MED_A1 ≤ −2.0` — already darkening, which would falsify §2 outright.

**Critic-form restatement**, reported for continuity with the `+2.9 L` number and gated on the
same sign: `HALO_X = mean(L_X over FOOT ∩ touched) − mean(L_X over OUT)`, where
`touched = { p ∈ FOOT : |L_A2 − L_A4| > 2 }` — a mask derived from the CAL-2 control pair and
applied **identically** to A1, A2 and A4. **PASS requires `HALO_A2 < 0`.**

**CR-1 — HALO INVERSION AT THE RIM.** The rim is where a broken multiply is brightest, so a fix
that only works in the core is not a fix. Score the outermost band of FOOT (radial fraction
`0.85–1.0` of the outer ring). **PASS requires `MED_A2(rim) ≤ 0`.**

**CR-2 — SIDE EFFECTS / §224.** `PX_FAR = |{ p ∈ FAR : |L_A2 − L_A1| > 2 }|`.
**PASS requires `PX_FAR ≤ 2 × PX_NULL`.** Any texture colour shifting would show here, since every
textured surface in the frame is outside the decals. A raw byte-histogram claim is deliberately
not used: the frame is the thing that matters and the null arm bounds it.

**CR-3 — THE BOOT WARNING.** Console errors captured from page load until the first runtime
mutation (i.e. the fix as it ships, not as it is poked). **PASS requires zero occurrences** of
`MultiplyBlending requires material.premultipliedAlpha`, with CAL-4 proving the listener works.

**Falsifiers — any one voids the fix**
- any calibration arm fails to fire;
- `|MED_NULL| > 0.5`;
- `MED_A2 ≥ 0` (CR-1 or primary);
- `PX_FAR > 2 × PX_NULL`;
- the in-page decal projection disagrees with §2.1's offline one by more than 4 px;
- any arm reports a COLLAPSED CAL-3 readback.

---

## 7. Predictions

**WOULD move**
- FOOT pixels in `courtyard` darker on A2 than on A4, most strongly at the core lobes of the
  near decals (11–15 m, 22–35 px projected radius).
- The rim band specifically: from brightest-of-the-decal to a no-op (`mix(vec3(1), tint, 0) = 1`,
  and `dst × 1 = dst`).
- The boot warning: present on A1, absent from the clean boot.

**WOULD NOT move**
- anything outside the decals — CR-2, and this is the §224 statement.
- **the floor under Sly's boots, in any shot.** §2.1. The critic's `+5.5 L` survives this fix and
  belongs to whoever owns the screen-space contact term.
- texture bytes, texture load time, or `torch_flame`.
- the KayKit showcase unless `?kaykit=1`, where the identical fix applies through the same class.

**WOULD NOT fix**
- §226's pre-existing anti-grounding halo from the screen-space contact term, which is a separate
  system with a separate owner and is the more likely author of the boots number.

# PREREG-rimink — DRAFT — which of the two live POSTFX levers owns the shadow-side deficit

**Status: DRAFT. NOT YET REGISTERED.** Every band, threshold, arm, edge and tolerance below is
final in intent and §141.1-binding **from the moment this file is committed and pushed with its
runner and scorer**. It is a draft only because those two do not exist yet (§12.1). No frame of
`progress/records/rimink1/` exists and no arm has been rendered.

**Lane:** POSTFX. **Date drafted:** 2026-08-15.
**Replaces:** `progress/records/rimsucc/PREREG-rimfloor.md`, **WITHDRAWN** — see its §W. That draft
proposed a dose of `TUNE.rimShadowFloor`; its acceptance number scored a **peak** statistic against
an **area** bar (§346 Correction 2, committed a second time), and at the like-for-like number the
lever is out of range on both scoring shots. **This file does not dose anything.**
**Parent:** `PREREG-rim.md` / `RESULT-rim.md` — VALID, **M1 SHARED · M2 DOWNSTREAM ·
M3 SCREEN-RIM-LIVE** (§343), as corrected by §346 and §347. The parent selected the route —
*POSTFX / display space* — and proposed no candidate. **This seal narrows the route to one of two
levers inside it, and likewise proposes no candidate.**
**Ancestry:** AGENTS §2.1.5 + §7.3 "No rim light separating silhouettes from the background" →
critic r13 #2 (§328) → §333 (ask the space question first) → §342.1/§342.2 (**the bar must be
relative**) → `PREREG-rim` (which space) → §346/§347 (the mechanism is the **ink**) → here.

**Instruments inherited verbatim, not re-derived:** `progress/records/rim/rim-edges.mjs` — the 21
registered edges, `SEARCH 6`, `RIMW 5`, `EXCL 6`, `SPIKE_L 20.0`, `PF_RGBDIST_MIN 8.0`, and
`spike = RIM − BODY`. Two declared deviations, both in §4.4, both landing before any frame exists.

**No `src` change. Nothing installed.** Every poked value is a live-read `postfx.tune.*` field —
two fields, `rimStrength` and `inkStrength`, plus `rimShadowFloor`, across four poke arms.
Verified by reading, §3. §186 is not engaged.

---

## 0. THE TWO CLAIMS THIS SEAL EXISTS TO TEST

Stated first, separately, and each with its own single falsifier (§10), because `RESULT-rim` §3's
recorded defect was a **compound** refuting condition that made its own test harder to trigger than
its claim deserved, and §348's standing lesson is that the pre-registered parts have survived three
rounds of re-derivation while the post-hoc narrative has not.

> **CLAIM 1 — MADE AND COVERED.** The shadow-side rim band *is* produced in display space, and the
> composite ink pass (`PostFX.js:1526-1542`) removes more of it than Path B's entire shipped
> delivery supplies.
>
> **CLAIM 2 — AMPLITUDE IS NOT THE LEVER.** `TUNE.rimShadowFloor` raised to its semantic ceiling
> (1.00) cannot buy back what that ink pass costs.

Neither claim is about a defect in Path B. **§347 settled that Path B is on contract to 0.16 %**
(`0.45 × 0.8087 × 0.995 × 10.67 = 3.864 L` predicted, 3.87 L measured), so there is nothing in it
to repair and this seal does not try. What is at issue is whether a *contract change* on that term
is worth proposing at all, given a second term in the same file, equally pokeable, measured by §346
to be removing **17.5 L** of shadow-side spike.

**Failing one claim does not rescue the other, and §10 says so explicitly.**

---

## 1. WHAT SURVIVES §346/§347, AND IT IS THE ONLY MATERIAL ANY BAR HERE IS BUILT FROM

Separated in the words §348 asks for.

### 1.1 VERIFIED — read in `src` or in the banked instrument output at this sha

| # | fact | where |
|---|---|---|
| V1 | `RIM` is `max L` over the `RIMW = 5` px immediately inside `i0`. **`spike` is a PEAK statistic**, on both faces | `rim-edges.mjs:18`, `:127` |
| V2 | The documented Path A shadow/lit ratio is **0.247 as a peak** and **0.112 as an area**; the instrument prints both and labels which is which | `rim-offline.mjs:77/81`; `antirim-profile.txt:698` |
| V3 | Measured Path A, linear, like-for-like: peak **0.222** against 0.247 (**~90 % of documented**), area 0.148 against 0.112. *"Over-delivers at 2×" is WITHDRAWN* | §346 C2; `antirim-profile.txt:694-698` |
| V4 | Per-shot split of Path B's shadow-side delivery, which no earlier document had: hero **4.643 L**, sly-profile **4.467 L**, pooled 3.870 L | `antirim-profile.txt` §B |
| V5 | Per-shot `off` statistics: hero KEY 27.543 / SHADOW 3.637 / **R = +0.1320**; sly-profile 29.370 / −2.867 / **R = −0.0976** | §B, recomputed |
| V6 | The RIM window is **46 % inside the ink dip on SHADOW edges and 12 % on KEY edges** (`inside50` 2.3 of 5 vs 0.6 of 5), and Path B at the shipped floor **does not change it** (2→2, 2→2, 2→2, 3→3, 2→2, 4→4, 1→1 from `off` to `screenoff`) | `antirim-profile.txt` §D |
| V7 | Band width: SHADOW contiguous run above BODY **1.57 px**, KEY **4.60 px** | §346; §G |
| V8 | The ink pass is strictly subtractive (`ink = min(…, c)`) and runs **after** the encode and after Path B | `PostFX.js:1453`, `:1487-1506`, `:1526-1542` |
| V9 | `mix(c, ink, line·0) = c` exactly in IEEE, so `inkStrength = 0` is a true OFF of the composite ink pass | `PostFX.js:1542` |
| V10 | `uRimShadowFloor`, `uRimStrength`, `uInkStrength`, `uRimFloorOffCut`, `uRimRadius` and the crease thickness are **all re-read every render** | §3 |
| V11 | The ink's width is resolution-anchored (`inkPixels(rows)`, `inkResScale`); the rim band's three radii are **not** | `Outline.js:114-131`; `PostFX.js:2238` vs `:2242` |

### 1.2 INFERRED — argued from the above, not measured

- **I1.** Each shot's own slope `PathB/0.45` — hero **10.319**, sly-profile **9.926** L per unit
  floor — is an **upper bound**, because it assumes `edge.b = 0` on the SHADOW edges. For `b > 0`
  the true slope is `PathB·(1−b)/(0.45+0.55b)`, which is smaller for every `b > 0`.
- **I2.** Nominal band-vs-ink overlap, from the radii and `inkPixels`: **46 %** of the rim band's
  3.2 px width lies inside the ink at 720 rows, **67 %** at 900, **88 %** at 1080 — AGENTS §1's
  ship resolution. Geometric, from nominal radii; the crease pass's real footprint is `edge.r`'s
  falloff, not a hard-edged disc.
- **I3.** The rim system's own documented shadow/key peak ratio, mixing V2's linear peak ratio with
  M1's display-measured 62.3/37.7 split and §347's 0.364 for Path B: `0.623×0.247 + 0.377×0.364 =`
  **0.291**. Mixed-space; used as a forecast in §10, **never as a bar**.

### 1.3 NOT CLAIMED

- Per-edge `edge.b`. Recovering it needs the `zero` arm (`rimShadowFloor = 0`), which this seal
  does **not** carry. `hero/glove-right`, which supplies **10.56 of hero's 13.93 L** of Path B
  response on three edges and which `PREREG-rim` §1.3 flagged as the least clean "which way is the
  key" call in the set, therefore stays unresolved. It is not dropped from any statistic here.
- Individual shares for AO / bloom / FXAA beyond §346's ruling-out.
- **The inverted-hull half of the ink.** `postfx.tune.inkStrength = 0` removes the composite crease
  pass **only**. The hull is scene geometry owned by `Outline.js` (`INK_PX`, `inkPixels`), it still
  writes near-black in every arm here, and removing it would need a SHADING-owned `src` change.
  This is the reason X1's disposition is **asymmetric** (§6.1) and it is stated before any frame
  exists rather than discovered in a RESULT.
- Anything about `night`'s shadow side. It carries no X-row (§2.2).

---

## 2. SHOTS AND ARMS — 18 frames, 3 chunks, one 2×2 factorial

### 2.1 Arms (6), in capture order, each applied RESTORE-FIRST from the all-base state

The design is a **2×2 on (Path B, composite ink)** plus one ceiling dose plus the bracket. It is the
smallest arm set that can measure the two levers **against each other in the same frame**, which is
the thing no document in this lineage has yet done.

| arm | state | cell |
|---|---|---|
| `off` | shipped (`rimShadowFloor 0.45`, `rimStrength 0.70`, `inkStrength 0.95`) | rim ✓ ink ✓ — the baseline; freezes `i0` and the kept-edge set; the whole of §5 |
| `screenoff` | `tune.rimStrength = 0` | rim ✗ ink ✓ — reproduces M3's 3.87 L |
| `noink` | `tune.inkStrength = 0` | rim ✓ ink ✗ — the rim system with the mark that covers it removed |
| `bothoff` | `tune.rimStrength = 0` **and** `tune.inkStrength = 0` | rim ✗ ink ✗ — **§346's own registered measurement, verbatim** |
| `d100` | `tune.rimShadowFloor = 1.00` | the amplitude lever at its **semantic ceiling** — above 1.0 a "floor" is not a floor |
| `back` | all base restored | the same-boot 0-px bracket against `off` (§302/§303/§331) |

`diff(off, back)` brackets **every** intervening poke of that shot. No arm reads a raw buffer, no
arm calls `debugRaw` or `debugTerm`; `V_NORAW` (§5.1) makes that a checked property.

**Why `d100` and not `d85`.** This seal does not ship, so there is no smallest-sufficient-dose rule
to serve. The only question the amplitude lever is asked is *what is the most it can do*, and that
is answered at the ceiling by one arm. Registering an intermediate dose would buy a linearity check
that §7.2 gets for free from the `screenoff` anchor.

**Why no `zero` arm.** `d100` gives the same lever a two-point line (`off` → `d100`, ΔF = 0.55) and
certifies it in the direction the seal actually uses. The `zero` arm's other product — closed-form
`edge.b` per edge — is explicitly **NOT CLAIMED** here (§1.3) rather than half-bought.

### 2.2 Shots: `hero` · `sly-profile` · `night`

Inherited from `PREREG-rim` §4 unchanged, so the edge list, coordinates and reproduced `off`
statistics all transfer.

- **`hero` and `sly-profile` are the SCORING shots.** Each carries KEY5 and SHADOW edges in the
  same frame, so each supplies its own denominator. X1–X5 are scored on these two and only these.
- **`night` carries NO X-row, registered in advance so its absence cannot later look like a dropped
  row.** Its "KEY" edges mean **5.96 L** (`antirim-profile.txt` §B: 3.38 / 13.70 / 0.80) — a fifth
  of the other shots' — because there is no key on Sly at night. A ratio with that denominator is
  noise, and `PREREG-rim` §4 excluded `night` from M2 for exactly this reason. `night` carries:
  pre-flight `PF_NIGHT`, the reported per-edge rows, `C1` (reported, §8.2) and **LOOK-4**.

### 2.3 Staging, warm-up, force-add — carried verbatim from `PREREG-rim` §4

`setShot(name, {})` with `dt` **UNDEFINED** so the world clock settles live onto the roster's own
value (§328/§330); then freeze, and render every arm with `step(2, 0)` + `renderFrame(0)` so all six
arms of a shot share ONE frozen world state. **Two discarded warm-up renders after staging, in
every chunk, before `off`** (§331). **The bracket bar stays at 0 px** — `PREREG-rim` got 0/0/0 with
five arms between and this seal adds one arm to that stack without relaxing the bar.
**Force-add every completed chunk's frames immediately** (§329.1).

### 2.4 Chunking preserves every bar (§141.1)

| bar | compares | crosses a boot? |
|---|---|---|
| `R_<shot>` | `off` vs `back`, same shot | **no** |
| `CAL_RIM` / `CAL_INK` | `off` vs `d100` / `noink`, same shot | **no** — each boot certifies its own levers |
| `PF_*` | that shot's own `off` | **no** |
| `X1`–`X5` | arms of one shot against each other | **no** |
| `C1` | `off` vs `d100`, `night` | **no** |
| `V_CHUNK_TREE` | one `src` hash at all three chunk times | by design |

**No bar in this seal compares pixels across shots**, and 3 shots × 6 arms = **18 frames**, 3
chunks of 6, one shot per boot — the same budget `PREREG-rimfloor` costed at 13.9 min per chunk.

---

## 3. BOTH LEVERS ARE POKEABLE LIVE — VERIFIED IN `src`, NO EDIT NEEDED

Read at this sha, not carried from the withdrawn draft.

```
PostFX.js:2302   cu.uInkStrength.value    = this.tune.inkStrength;
PostFX.js:2321   cu.uRimStrength.value    = this.passes.edge.enabled ? this.tune.rimStrength : 0;
PostFX.js:2322   cu.uRimShadowFloor.value = this.tune.rimShadowFloor;
PostFX.js:2324   cu.uRimFloorOffCut.value = this.tune.rimFloorOffCut;
```

All four sit in the same per-frame composite-uniform block and are **re-read on every render**.
Two more, in `_renderChain` step 4 (the edge pass), likewise per frame — they matter to §8, not to
any arm here:

```
PostFX.js:2238   u.uParams.value.set( …, this.tune.edgeThickness * inkResScale( this.size.h ), 0 );
PostFX.js:2242   u.uRimRadius.value.set( this.tune.rimInner, this.tune.rimMid,
                                         this.tune.rimOuter, this.tune.rimTail );
```

**There is no clamp, no cache and no rebuild on any of these paths.** The only other occurrence of
`rimShadowFloor` in `src/` is `ToonMaterial.js`'s unrelated `rimShadowFloorArch` — the *surface*
rim's architecture floor, a different term on a different path.

- `screenoff` is a true OFF **by control flow**: the whole Path-B branch is gated
  `if ( uEdgeEnabled > 0.5 && uRimStrength > 0.0 )` (`PostFX.js:1487`).
- `noink` is a true OFF of the composite ink **by arithmetic**: `c = mix(c, ink, clamp(line,0,1) *
  uInkStrength)` at `uInkStrength = 0` is exactly `c` (V9). It does **not** remove the hull (§1.3).
- `d100` takes the same untaken branch as shipped: `uRimFloorOffCut` stays 0 in every arm, so
  `PostFX.js:1493`'s `if` is never entered and `rimFloor = uRimShadowFloor` byte-for-byte.

**Conclusion: no `src` edit is required for any arm of this seal, and none is proposed.** That is
what lets `V_CHUNK_TREE` demand one `src` hash across all three boots.

**`rimFloorOffCut` is used NOWHERE**, for §327's measured reason carried from the withdrawn draft
§3.4: `PREREG-rimfloor2`'s `P_slyrim_CU`/`P_slyrim_PR` — the bars built to prove the character's own
rim survives an off-subject cut — **failed on all four arms** with the dilated subject mask in
place. A mask that leaks when cutting leaks when raising.

---

## 4. THE STATISTIC — RELATIVE, AND THE TWO DECLARED DEVIATIONS

### 4.1 `R`

```
                mean over that shot's SHADOW edges of spike(arm)
R(arm, shot) =  ───────────────────────────────────────────────
                mean over that shot's KEY5   edges of spike(arm)
```

Both terms from the **same frame**, on the **same registered edges**, with `i0` frozen from `off`.

**Why relative and not an absolute display-L figure**, carried from §342.1/§342.2. §342.1: *"an
absolute bar silently imports the albedo of whatever material it was calibrated on; the successor's
bar must be relative … because those are properties of the shading path rather than of the material
that happened to be under it."* §342.2 then sharpened it: its "matched control" was in the same
*frame* but a different *lighting state*. Both apply here. An absolute bar would import Sly's
costume albedo, the shot's exposure, and — through the `(1 − c)` light-wrap at `PostFX.js:1506` —
the base level the band sits on. `R` divides the shadow side by the key side **on the same
character, in the same frame, through the same transform**, so all three cancel to first order; and
every arm comparison is state-matched in the strongest available sense — one frozen world, one
uniform changed.

### 4.2 Deviation 1 — `i0` frozen from `off`

`rim-score.mjs` recomputes `i0` (the ink minimum) per frame. Across arms of one shot that is wrong
here, and **more wrong than it was for the withdrawn draft**: `noink` and `bothoff` remove the
crease pass outright, which moves the argmin. A moving window would make the arm difference partly
an instrument difference.

**Registered: `i0` and the kept-edge set are computed on that shot's `off` arm and reused,
unchanged, for all six arms of that shot.** Same pixels, same window, one uniform different.

### 4.3 Deviation 2 — an EXCL-9 sensitivity on the ink arms, and what it can do

`BODY` excludes `EXCL = 6` px either side of `i0`. The ink dip is **wider than that on some edges**
— `antirim-profile.txt` §D gives `w25` up to **12–13 px** at `hero/torso-back` and
`hero/glove-right` — so removing the ink can move `BODY` itself. Since `spike = RIM − BODY`, a
`BODY` that *falls* makes the spike read *high*, which is the direction that flatters CLAIM 1.

**Registered:** every X-row is computed a second time with `EXCL = 9` and both numbers are
reported. **If the `EXCL = 9` recomputation moves `X2`'s `K` across either of its registered bounds
(0.137 or 0.25), `X2` is NO-CLAIM** — the verdict must not depend on the exclusion width. The
primary number remains the inherited `EXCL = 6`. Both figures are fixed now, before any frame
exists, which is the only way §141.1 permits either.

---

## 5. VALIDITY AND PRE-FLIGHT — fail-closed, before any bar is adjudicated

**VOID is not PASS.** Any gate failing means the rows it covers are VOID and nothing is claimed
from them; a VOID run is archived (`mv progress/records/rimink1 progress/records/rimink1-void-runN`),
diagnosed from readbacks and stamps, and relaunched whole. No resume.

### 5.1 Validity

| gate | bar | on failure |
|---|---|---|
| `V_ROWS` | 18 rows | **VOID** |
| `V_CHUNKS` / `V_CHUNK_TREE` | 3 chunks present; **one** `src` content hash across all three | **VOID** |
| `V_READBACK` | §40 readbacks from the **live uniforms after `renderFrame(0)`**, never from `this.tune`: `uRimShadowFloor`, `uRimStrength` and `uInkStrength` at their commanded values on every row; `uRimFloorOffCut == 0` and `uEdgeEnabled == 1` on **every** row | **VOID** that row's shot |
| `V_NORAW` | `postfx._debugRaw === false` on every captured row. No arm reads a raw buffer, so the parent's `CLIP` gate has nothing to protect; this makes that a checked property rather than an intention | **VOID** that row's shot |
| `V_OK` | `postfx.ok === true` and zero page console errors at every row — catches a composite that failed to compile and degraded to direct rendering (§210.2) | **VOID** |
| `R_<shot>` ×3 | `diff(off, back) == 0 px` | **VOID** that shot |

### 5.2 In-boot calibration — deliberately identical gates on the two levers

The parent's `CAL` certified a debug bypass. This seal reads through nothing, so that calibration
certifies nothing here. What must be certified **in this boot** is that *each lever moves the pixels
the seal reads*:

| gate | bar | derivation | on failure |
|---|---|---|---|
| `CAL_RIM_<shot>` | mean over that shot's SHADOW edges of `spike(d100) − spike(off)` ≥ **2.0 L** | the pooled predicted increment for ΔF = 0.55 is `3.87 × 0.55/0.45` = **4.73 L** (V4); 2.0 L is 42 % of it, so a shot delivering under half the pooled response still certifies. It is also **2.55×** the 0.784 L quantisation floor of a spike difference | **VOID** that shot's rim rows |
| `CAL_INK_<shot>` | mean over that shot's SHADOW edges of `spike(noink) − spike(off)` ≥ **2.0 L** | **the same number, deliberately.** §346 predicts ≈ +17.5 L here, so this gate clears by ~8.75× — but setting it *lower* than `CAL_RIM` would smuggle an ordering of the two levers into the gates that adjudicate between them. Identical gates, no thumb on the scale | **VOID** that shot's ink rows |
| `CAL_NIGHT` | whole-frame count of pixels with `\|ΔL\| ≥ 2` between `off` and `d100` ≥ **200 px** | `PREREG-rimfloor2` §4's `BG_char` scoreability floor, carried | `night`'s `C1` is **NO-CLAIM**; cannot VOID anything, since night carries no X-row |

### 5.3 Pre-flight — the runner must reproduce the defect first (§328)

Scored on the `off` arm **before any X or C row is computed**. The first four are `PREREG-rim` §5's,
carried at their sealed values, unmoved; the fifth is carried from the withdrawn draft §5.3, whose
derivation survives §346/§347 untouched because it rests only on V5.

| gate | bar | on failure |
|---|---|---|
| `PF_EDGE` | every registered edge locates `i0` **strictly inside** the ±6 window on `off`, and the **RGB distance** between its BODY and BG channel medians is ≥ **8.0** | that edge is **dropped and named**; **> 3** of 21 dropping ⇒ **VOID**. `night/torso-right` is expected to drop, **PINNED** |
| `PF_REPRO_KEY` | ≥ **4 of the 5** registered SPIKE edges read `spike ≥ 20.0` on `off`, **and** ≥ 4 survived `PF_EDGE` | **VOID** — the runner is not staging the frame the defect lives in |
| `PF_REPRO_SHADOW` | **all 7** registered SHADOW edges read `spike < 20.0` on `off` | **VOID** — there is no defect to attribute |
| `PF_NIGHT` | every valid `night` edge reads `spike < 20.0` **and** `\|BODY − BG\| ≤ 8.0 L` | **VOID** |
| `PF_RATIO` | on `off`: `R(sly-profile) ≤ 0.00` **and** `R(hero) ≤ 0.20` | **VOID** — the defect must be present **in this seal's own statistic** |

**`PF_RATIO`, one-sided and why.** The references are V5: `R(off, hero) = +0.1320`,
`R(off, sly-profile) = −0.0976`. `RESULT-rim` reproduced every kept edge within **±0.05 L** on a
different tree, which propagates to `|ΔR| ≲ 0.002`; the bars sit **0.068** and **0.098** away —
34× and 49× that propagated error — because the gate's job is to fail when the defect is *gone*, not
to fail on drift. One-sided in the direction "the shadow side is still at or below nothing", which
is the defect. A two-sided band would VOID on the shot-specific background drift `RESULT-rim` §1
documented, and `spike` does not use BG at all.

---

## 6. THE BARS — every one derived from §1.1, with the derivation shown

All five are scored on `hero` and `sly-profile` only, over edges surviving `PF_EDGE`, with `i0`
frozen from `off`, and each is reported at `EXCL = 6` (primary) and `EXCL = 9` (§4.3).

### 6.1 X1 — with the ink removed, does the shadow side carry Path A's own documented fraction?

> **`R(noink, shot) ≥ 0.247`**, on `hero` **and** `sly-profile`.

**Derivation of 0.247.** It is `rim-offline.mjs` §2's **peak** amplitude ratio of the shipped Path A
expression — `toon.glsl.js:1029-1031` and `:1190` at `uRimPower 3.1`,
`smoothstep(-0.35, 0.45, ndl)`, `smoothstep(0.26, 0.58, fres·mix(0.60,1,wrapRim))`,
`mix(0.55,1,sh)`, `mix(0.45,1,wrapRim)` — printed by the instrument and labelled by
`antirim-profile.txt:698` as *"0.247 (peak)"* against *"0.112 (area)"*. **`R` is a ratio of peaks
(V1), so 0.247 is the like-for-like comparand and 0.112 is not.** This is the correction §346
Correction 2 made to `RESULT-rim` §3, applied to a bar instead of to a measurement row. A band
carried from an instrument that already existed cannot have been tuned to this run's frames.

**It is deliberately a conservative floor, twice over, and both reasons are stated now.** (a) It is
**Path A's** ratio, while `noink` carries Path A **and** Path B; the system's own documented figure
is I3's **0.291**. (b) §346 §E measured the display transform carrying the linear shadow band
*upward* — 8.87 L raw to a predicted **+14.17 L** display spike, ×1.60 — while compressing the much
brighter key spike, so a display ratio should read **above** its linear comparand. `PREREG-rim` §3's
gain argument, which `RESULT-rim` marked refuted and §346 restored as *"right in direction"*, is
exactly this effect.

**Disposition is ASYMMETRIC, and this is registered rather than discovered.** X1 **PASS** ⇒ CLAIM 1's
first half is established: the band is there, and something drawn after it is removing it. X1
**FAIL** ⇒ **NO-CLAIM**, *not* a refutation — because `inkStrength = 0` removes only the composite
crease pass and the inverted-hull half is still present in every arm (§1.3). A failing X1 is
ambiguous between "the band is not made" and "the hull is still covering it", and separating those
needs a SHADING-owned `src` change this seal does not have. **X1 therefore does not carry CLAIM 1's
falsifier; X2 does.**

### 6.2 X2 — what the composite ink costs, in the same relative units

> **`K(shot) = R(noink, shot) − R(off, shot)`**
> **INK-DOMINANT** `K ≥ 0.25` on both scoring shots · **INK-MINOR** `K ≤ 0.137` on either ·
> otherwise **INK-PARTIAL**.

Both terms are within-frame ratios on the same edges of the same character, so `K` is
"how much more of the key-side band the shadow side carries once the ink is removed" — relative in
§342.1's sense, and dimensionless.

**Derivation of 0.25.** §346's own registered prediction for the ink's shadow-side cost is
**+14.17 L**, against the KEY5 band of **28.27 L**: `14.17 / 28.27 = 0.5012`. **0.25 is half of
that** — the same "half the predicted effect still certifies" construction `PREREG-rimfloor` used
for `CAL_LEVER`, and it means a shot carrying only half the pooled ink cost still reads DOMINANT.

**Derivation of 0.137.** `3.87 / 28.27 = 0.1369` — **the whole of Path B's shipped shadow-side
delivery, as a fraction of the key-side band** (V4, M3). Below this the ink is costing less than the
term that is already on spec is delivering, and amplitude would be the better lever. It is the
natural pivot between the two claims and it is a measured quantity, not a round number.

**The gap [0.137, 0.25] is where neither reading is licensed**, and INK-PARTIAL is reported with no
route claimed. Registered so that a middling result cannot be narrated into either camp afterwards
— which is the failure mode §347 named as three rounds deep.

**Conservative direction, stated:** removing the ink raises the KEY side too (V6: `inside50` 0.6 of
5 on KEY), so `R(noink)`'s denominator grows and `K` reads **lower** than a fixed-denominator
version would. The bar is harder than it looks, in the direction that protects CLAIM 1 from itself.

### 6.3 X3 — the head-to-head: can the amplitude lever buy back what the ink costs?

> **`A(shot) = [ R(d100, shot) − R(off, shot) ] / K(shot)`**
> **AMPLITUDE-SUFFICIENT** `A ≥ 1.00` on both scoring shots · otherwise **AMPLITUDE-PARTIAL**.
> **NO-CLAIM** for a shot whose `K < 0.05` — a ratio against a near-zero denominator is noise;
> 0.05 is 0.784 L (the spike quantisation floor) against a ~28 L key band, rounded up.

**Derivation of 1.00.** It is not a chosen threshold: it is the point at which the two levers have
**equal reach in the same frame, in the same statistic, on the same edges**. Numerator and
denominator are both differences of within-frame ratios, so the ink pedestal §347 identified —
which is what makes a *level* bar on `R` unfair between hero (+0.132) and sly-profile (−0.098) —
cancels in both.

**Predicted, from V4 and I1 (upper-bound slopes, i.e. the most favourable case for the lever):**

```
hero          Δshadow(F 0.45→1.00) = 4.643 × 0.55/0.45 = 5.675 L  →  ΔR = 5.675/27.543 = 0.206
sly-profile   Δshadow               = 4.467 × 0.55/0.45 = 5.459 L  →  ΔR = 5.459/29.370 = 0.186
against a predicted K of ~0.37 (hero) / ~0.60 (sly-profile)       →  A ≈ 0.56 / 0.31
```

**X3 carries CLAIM 2's falsifier (§10.2).**

### 6.4 X4 — Path A alone, ink removed, against its own contract end to end (reported)

> `R(bothoff, shot)` against **0.247**. **Reported, not gated.**

This is the like-for-like test `RESULT-rim` §3's M2 was reaching for and got wrong: Path A's shadow/
key **peak** ratio, measured through the entire display chain with the confound removed, against the
**peak** figure its own constants declare. It is reported rather than gated because §346 already
adjudicated the linear form (V3: 0.222 vs 0.247, ~90 %) and a second adjudication of one claim on
one lane's frames is not what this seal is for. Its value is that it puts §346's forward model —
which was a *fit* — on a directly measured arm.

### 6.5 X5 — does the ink attenuate Path B's own output? (reported)

> `G(shot) = [ SHADOW(noink) − SHADOW(bothoff) ] / [ SHADOW(off) − SHADOW(screenoff) ]`
> **ATTENUATED** `G ≥ 2.0` · **PASSED-THROUGH** `G ≤ 1.25` · otherwise **PARTIAL**.
> **NO-CLAIM** if the denominator is < **1.0 L** (two 8-bit codes, 0.784, rounded up as in §7.1).

Path B's delivery with the ink off, over its delivery as shipped. Pure ratio of two same-shot,
same-edge quantities — the key-side denominator cancels entirely.

**Derivation of the bands.** If the ink is a multiplicative attenuator with factor `1 − a` where
`a = line · inkStrength`, then `G = 1/(1−a)`. §346 forward-fitted `a` at the discriminating pixels
to **0.88–0.97**, which predicts `G` of **8.3–33**. **2.0 is a factor of four below the weakest end
of that fit** (`a = 0.50`), and **1.25 is `a = 0.20`**, an order of magnitude below its floor. Both
bands are deliberately far outside the fit, because the fit is a fit and this row is the measurement
that would replace it. The denominator is V4's 4.643 / 4.467 L, so both shots clear the NO-CLAIM
floor by ~4.5×.

**Why the regime does not change on the way up, checked rather than assumed.** `ink = min(inkColor,
c)` is per-channel, so the pass is a fixed-colour attenuator only where `c > inkColor` and the
identity where `c < inkColor`. `inkCool #161022` is **L = 7.28** and `inkWarm #1a1210` is
**L = 7.67**; the measured `RIM` L on every hero / sly-profile SHADOW edge is **26.10–43.67**
(§B: BODY + spike). Every scoring pixel is already in the attenuating regime, and brightening it
keeps it there — so `G` is a single ratio and not a piecewise one. The withdrawn draft's §1.1
checked the ink's *luminance gate* for saturation and did not check this; it comes out in the
model's favour.

---

## 7. THE REPORTED ROWS

### 7.1 Per-edge, every kept edge, all three shots

`spike` in all six arms; `PathB = off − screenoff`; `Ink = noink − off`;
`PathB_noink = noink − bothoff`; `BODY` in all six arms; `rimAt` (where in the 5 px window the max
landed) in all six arms. `rimAt` is reported because V6/V7 make it the diagnostic that says whether
a number moved because the band got brighter or because the max moved out of the ink.

### 7.2 M-LIN — is the amplitude response affine, on the two points available?

`amt = edge.g · S · (F(1−b) + b)` is affine in `F` by construction (`PostFX.js:1505`), and
`edge.g ≤ 1` with `amt ≤ 0.70` bounds the band away from clipping, so a *third* point is not needed
to test the form — the `screenoff` anchor gives it for free. Reported: for each shot,
`[spike(d100) − spike(off)] / [spike(off) − spike(screenoff)]`, whose affine prediction at `b = 0`
is exactly `0.55/0.45 = 1.222`. **A measured value below 1.222 is `edge.b > 0` on those edges and is
reported as such** (I1), not as a model failure. **Reported, not gated** — this seal doses nothing,
so a slope it gets wrong costs a successor's dose choice, not a ship.

### 7.3 M-CONTRACT — §347's arithmetic on this boot's own frames (reported)

```
Rb(shot) = [ SHADOW(off) − SHADOW(screenoff) ] / [ KEY(off) − KEY(screenoff) ]
```

Predicted **0.45 × 0.8087 × ≈1.00 = 0.364** (§347); the pooled figure it must reproduce is
`3.87 / 10.67 = 0.363`. Per-shot from V4: hero `4.643/11.947 = 0.389`, sly-profile
`4.467/8.775 = 0.509`. **Reported per shot, not gated.** Its purpose is to put §347's correction on
measured frames rather than on a re-reading of the parent's table — and the per-shot spread above,
which no document has yet remarked on, is itself the reason it is worth printing.

---

## 8. THE COST ROW, AND THE SUCCESSOR CANDIDATE THIS SEAL IS BUYING

### 8.1 Nothing ships from this seal

Registered here, at the top of the section, so §12 cannot be read as leaving a door open.
`TUNE.rimShadowFloor` stays at **0.45**, `TUNE.inkStrength` stays at **0.95**, and no `src` byte
moves. `inkStrength = 0` is a **diagnostic arm and never a candidate** — AGENTS §2.1.2 makes ink one
of two required outline systems and §7.3 fails a shot for missing outlines. "Less ink" is not on the
table; **moving the rim out from under it** is (§8.3).

### 8.2 `C1` — the off-subject cost of the amplitude lever, reported for the successor

On `night`, fraction of frame pixels with `|ΔL| ≥ 2` between `off` and `d100`, reference band
**≤ 12 %** — `PREREG-rimfloor2` §4's `P_nightbudget`, carried verbatim: same shot, same uniform,
sealed 2026-08-14. **Reported, not gated**, because nothing ships. It exists so that if X3 returns
AMPLITUDE-SUFFICIENT — refuting CLAIM 2 — the successor that doses the floor already has §327's
family-3 cost measured on the same frames instead of extrapolated.

### 8.3 The named successor candidate, with its derivation already written

**VERIFIED (V11):** within `PostFX.js`, the crease ink's width is multiplied by
`inkResScale(this.size.h)` at `:2238` and the hull's is set by `Outline.js:inkPixels(rows) =
clamp(2.5 × rows/1080, 0.9, 5.0)` — *"one function for the whole ink system … the way that ends is
one of them being rescaled and the other not."* `TUNE.rimInner/rimMid/rimOuter = 1.2/2.6/4.4` reach
`uRimRadius` **raw** at `:2242`, at every resolution.

**INFERRED (I2):** the rim band's 3.2 px is **46 %** under the ink at 720 rows, **67 %** at 900,
**88 %** at **1080 — AGENTS §1's ship resolution**. If that holds, the defect is worse in the
shipped frame than in the frame this entire lineage measured it in, and the cause is a res-scale
present on one of two deliberately-coupled terms and absent on the other.

**The lever needs no `src` change either** (`PostFX.js:2242`, per frame, VERIFIED). The obvious dose
is `rimInner/rimMid/rimOuter × 1/inkResScale(rows)` — 1.8/3.9/6.6 at 720 rows — which restores the
band's position relative to a line whose width does scale. **Not proposed here and not costed here.**
It is named so that this seal's product is a *route with a candidate attached*, which is what §343
could not supply, and so that if X1+X2 return MADE-AND-COVERED the successor does not start from a
blank page.

---

## 9. BINDING LOOK

Adjudicated in the RESULT, from crops the scorer emits. **A LOOK failure overrules the row it
touches, whatever the table says, and cannot be traded against a passing bar. A LOOK pass certifies
nothing on its own.**

1. **`sly-profile.off` vs `sly-profile.noink`, 1× and 4× on the back, at `cap-back` and
   `tail-right`.** A human must see a **cool band revealed** along the shadow-side silhouette that
   the shipped frame does not show. *If the two are indistinguishable at 4×, `X2`'s INK-DOMINANT is
   overruled to **NO-CLAIM*** — a term that moves a number and not a frame has not established a
   mechanism. (Form carried from `PREREG-rim` §9.1, which used it the other way round and passed.)
2. **`sly-profile.off` vs `sly-profile.d100`, same crops, 1× and 4×.** A human must see a cool band
   **appear**. *If indistinguishable at 4×, `X3`'s numerator is overruled to **NO-CLAIM***, and
   AMPLITUDE-PARTIAL is then reached by the LOOK rather than by the ratio.
3. **`hero.noink` and `sly-profile.noink` at 1×: the character must still carry visible outlines.**
   This is a control on **my own arm specification**, not on the result: `inkStrength = 0` is
   supposed to remove the crease pass and leave the inverted hull (§1.3). *If Sly reads as having no
   outline at all, the arm removed more than it was specified to and the `noink`/`bothoff` rows are
   **VOID***.
4. **`night.off` vs `night.d100` at 1× and 3× on the wall and the deck edge.** Report whether
   architecture acquires new seam glints (§327 family 3) **and** whether the rooftop still separates
   — `PREREG-kerb`'s V3 lesson is that the second half dies quietly. **Reported, not gating**, since
   nothing ships; it is `C1`'s qualitative half for the successor.

---

## 10. REGISTERED FORECAST — probabilities, and ONE falsifier PER CLAIM

Written before any frame exists. The probabilities are mine and are recorded so they can be wrong on
the record: `RESULT-rim` got all three of its forecasts wrong with a valid instrument, and
`PREREG-rimfloor` died on a bar its author had no reason to doubt.

| row | forecast | p |
|---|---|---|
| `X1` `R(noink) ≥ 0.247` | **PASS on both shots** | **0.70** |
| `X2` | **INK-DOMINANT** (`K ≥ 0.25`) | **0.65** |
| `X3` | **AMPLITUDE-PARTIAL** (`A < 1.00`) | **0.80** |
| `X4` `R(bothoff)` | lands in **0.30–0.60** | **0.55** |
| `X5` | **ATTENUATED** (`G ≥ 2.0`) | **0.60** |
| every `V_*` / `PF_*` gate passes | **VALID run** | **0.75** |

**X1 at 0.70.** For: §346 §E's forward model predicts the ink-free shadow band at **+14.17 L**
against a key band of order 28–39 L, i.e. `R ≈ 0.4–0.5`, comfortably over 0.247; and I3 puts the
system's own documented figure at 0.291. Against: the hull half of the ink is still in the frame
(§1.3), `bothoff`'s two `tail-right` edges have **no linear band at all** (§346's NOT-CLAIMED: raw
peaks −1.13 and −0.84), and they are 1 of 3 SHADOW edges on each scoring shot.

**X2 at 0.65.** The pooled prediction is 0.501, twice the bar. The 0.35 is that `K`'s denominator
grows with the ink removed (§6.2) by an amount nobody has measured, and that hero's `K` leans on
`glove-right`, the edge §1.3 leaves unresolved.

**X3 at 0.80 — and this is the row I am most confident about, which is exactly why it carries a
falsifier.** The predicted `A` is 0.31–0.56 using slopes that are *upper bounds* (I1); every `b > 0`
pushes it lower. It would take the ink costing less than half what §346 predicts *and* the amplitude
lever running at its optimistic ceiling for A to reach 1.00.

**X5 at 0.60.** §346's fit predicts `G` of 8.3–33 against a bar of 2.0 — a huge margin. The 0.40 is
that the fit is a fit, that `line` is **inferred** and never read (`debugRaw` supports only
`scene`/`normal`/`ao`), and that Path B's contribution peaks at offsets −3…−5 while the ink's
residual peaks at −1…−2 (§346), so Path B may sit largely *outside* the ink's core and pass through
almost intact — which is the PASSED-THROUGH outcome and would hand the lever back to amplitude.

### 10.1 The single condition that refutes CLAIM 1

> **`X2` returns INK-MINOR — `K ≤ 0.137` on either scoring shot.**

One row, one condition, no co-firing requirement. It is exactly the content of CLAIM 1: *the
composite ink pass removes more shadow-side rim than Path B's entire shipped delivery supplies.*
0.137 **is** Path B's entire shipped delivery as a fraction of the key band, so the falsifier and
the claim are the same sentence read backwards. If it fires, §346's and §347's attribution of the
anti-rim to the ink is wrong on these frames, the route goes back to open, and `PREREG-rimink` §8.3's
successor candidate is withdrawn with it.

**Deliberately NOT the falsifier for CLAIM 1: `X1` failing.** `X1` cannot distinguish "the band is
not made" from "the hull is still covering it" (§6.1), so treating it as a refutation would make the
falsifier *stronger* than the claim — and treating INK-PARTIAL as a refutation would make it
*weaker*. Both are the error `RESULT-rim` §3 recorded, in the two available directions.

### 10.2 The single condition that refutes CLAIM 2

> **`X3` returns AMPLITUDE-SUFFICIENT — `A ≥ 1.00` on both scoring shots.**

One row, one condition. It is exactly the content of CLAIM 2: *`rimShadowFloor` at its ceiling
cannot buy back what the ink costs.* If it fires, `PREREG-rimfloor`'s withdrawal was right on its
bar and wrong on its route: the amplitude lever **is** competitive, a dosing seal is back on the
table, and this run has already measured its per-shot response line and its `night` cost (§8.2) so
the successor can be written from data instead of from a pooled substitution.

**These are two claims and two falsifiers. Neither rescues the other**, and no combination of them
is registered as a condition. CLAIM 1 can be refuted while CLAIM 2 survives (the ink is innocent
*and* the floor is still too small — which routes to §8.3's geometry lever or out of POSTFX
entirely), and CLAIM 2 can be refuted while CLAIM 1 survives (the ink is the killer *and* the floor
can out-shout it anyway).

---

## 11. WHAT THIS SEAL DOES NOT DO

1. **It does not close §7.3's "No rim light separating silhouettes from the background", and no
   POSTFX arm here could.** "A rim is present" is `spike ≥ 20.0 L` (`PREREG-rim` §1.3(b)), which is
   **0.707** of the key-side band; from V4/I1 that needs `F = 2.04` (hero) / `F = 2.75`
   (sly-profile), both far outside the uniform's semantic range. §7.3 is closed by a LOOK or not at
   all.
2. **It does not dose anything and it ships nothing** (§8.1).
3. **It does not touch Path A.** No `wrapRim`, no `uRimGain`, no `toon.glsl.js`, nothing in SHADING.
   §346's corrected reason: Path A emits **~90 %** of its documented peak — about what it was
   designed to — and the loss is downstream in a mark drawn over it.
4. **It does not re-score M1 / M2 / M3.** Those verdicts stand; `screenoff` is here as a factorial
   cell, not to re-litigate them.
5. **It does not remove the inverted hull** and does not claim to have isolated "the ink" (§1.3).
   The composite crease pass is what `inkStrength` reaches, and X1's asymmetric disposition is the
   price of that.
6. **It scores no X-row on `night`** (§2.2), the critic's named worst case. A result on hero and
   sly-profile has **not** been shown to hold at night, and this seal cannot show it.
7. **It does not recover `edge.b`** (§1.3), so `hero/glove-right` — 76 % of hero's Path B response
   on three edges — remains an unresolved contaminant of the SHADOW7 set, named and not dropped.
8. **It changes no `src` byte during the capture window and installs nothing** (§3).

---

## 12. DISPOSITION AND WHAT REGISTRATION REQUIRES

### 12.1 Registration is not complete until these exist

This file is a **DRAFT** until all three are committed and pushed **together**, at one sha, with
`progress/records/rimink1/` non-existent at that sha:

1. this file;
2. `progress/records/rimsucc/rimink-run.mjs` — `progress/records/rim/rim-run.mjs` with the arm
   table replaced (`ARMS = ['off','screenoff','noink','bothoff','d100','back']`,
   `EXPECT_ROWS = 18`) and the four `debugRaw`/`debugTerm` calls removed; staging, warm-up,
   readback-from-live-uniform, tree stamps, `PF6`/`PF7` launch pins and the force-add discipline
   carried unchanged;
3. `progress/records/rimsucc/rimink-score.mjs` — importing `EDGES` and the statistic from
   `progress/records/rim/rim-edges.mjs` unchanged, adding §4.2's frozen-`i0` and §4.3's EXCL-9
   deviations, §5's gates, §6's X-rows, §7's reported rows and §8.2's `C1`.

A `rimink-derive.mjs` reproducing every number in this file from `antirim-profile.txt` §B/§D, the
shipped constants and `rim-offline.mjs`'s printed ratios must land with them, so the seal's
derivation and its verdict cannot drift apart. It reads no frame.

### 12.2 Outcome branches

- **Any `V_*`, `CAL_*` or `PF_*` gate FAILS ⇒ VOID.** Nothing is claimed about either lever.
  Archive, diagnose, relaunch whole. VOID is not PASS.
- **`X1` PASS ∧ `X2` INK-DOMINANT ∧ `X3` AMPLITUDE-PARTIAL ⇒ MADE-AND-COVERED.** Both claims stand;
  the route is the **band/ink geometry**, and §8.3's candidate is handed to the successor with I2's
  arithmetic now testable against measured `rimAt` values. `TUNE.rimShadowFloor` is closed as a
  lever and the withdrawn draft's withdrawal is confirmed by measurement rather than by arithmetic.
- **`X2` INK-MINOR ⇒ CLAIM 1 REFUTED** (§10.1). The ink attribution in §346/§347 does not hold on
  these frames; §8.3's candidate is withdrawn; the route reopens and a correction is written at
  §346/§347's declaration site, not here.
- **`X3` AMPLITUDE-SUFFICIENT ⇒ CLAIM 2 REFUTED** (§10.2). A dosing seal on `rimShadowFloor`
  becomes legitimate — as a **contract change** justified by AGENTS §2.1.5 and §7.3, never as a
  repair, since §347 settled that there is nothing to repair — and it inherits this run's measured
  per-shot response line, its `night` cost (§8.2) and LOOK-2's verdict on whether the character
  still reads as lit from one direction.
- **`X2` INK-PARTIAL ⇒ no route is claimed.** Reported, and the successor is a **wider-window
  instrument** (§4.3's EXCL-9 result decides how much wider) before any further lever is dosed.
- **A LOOK fails ⇒ the row it names is overruled** (§9), including to VOID in LOOK-3's case.

### 12.3 §141.1, absolute

No band, threshold, arm state, edge coordinate or tolerance in this file moves once a frame exists.
Fixed now, in advance: `X1`'s **0.247**; `X2`'s **0.25** and **0.137**; `X3`'s **1.00** and its
**0.05** NO-CLAIM floor; `X5`'s **2.0**, **1.25** and **1.0 L**; the `d100` dose of **1.00**;
`CAL_RIM`/`CAL_INK`'s **2.0 L** and `CAL_NIGHT`'s **200 px**; `PF_RATIO`'s **0.00 / 0.20**; `C1`'s
**12 %**; the **EXCL 9** sensitivity; and the inherited **20.0 L**, **±6 px**, **RIMW 5**,
**EXCL 6**, **8.0 RGB** instrument constants. If the fresh `off` arm makes any of them look badly
chosen, **that is a finding to write down, and a re-seal is a NEW file** — which is precisely what
this file is.

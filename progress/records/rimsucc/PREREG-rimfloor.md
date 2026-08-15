# PREREG-rimfloor — DRAFT — dosing `TUNE.rimShadowFloor`, the one rim term already in display space

**Status: DRAFT. NOT YET REGISTERED.** Every band, threshold, dose, edge and rect below is
final in intent and §141.1-binding **from the moment this file is committed and pushed with its
runner and scorer**. It is a draft only because those two files do not exist yet (§12). No frame
of `progress/records/rimfloor1/` exists and no arm of this seal has been rendered.

**Lane:** POSTFX. **Date drafted:** 2026-08-15.
**Parent:** `PREREG-rim.md` / `RESULT-rim.md` (VALID: **M1 SHARED · M2 DOWNSTREAM ·
M3 SCREEN-RIM-LIVE**, KNOWN_ISSUES §343). The parent selected the route — *POSTFX / display
space* — and explicitly proposed no candidate (`PREREG-rim` §8). **This file is the candidate.**
**Ancestry:** AGENTS.md §2.1.5 ("the single biggest AAA tell") + §7.3 "No rim light separating
silhouettes from the background" → critic r13's #2 ranked problem (§328) → §333 (ask the space
question first) → §327 (`rimfloor2` DO NOT SHIP — the off-subject scope is not trustworthy) →
§342.1/§342.2 (**the successor's bar must be relative**) → `PREREG-rim` (which space) → here.

**NAME COLLISION, flagged before it costs anyone an hour.** `progress/records/PREREG-rimfloor2.md`
already exists and is a **different seal**: it cut the floor *off-subject* via
`TUNE.rimFloorOffCut` and all four of its arms were rejected (§327). This file is not its take 3.
It **raises** the floor, it uses `rimFloorOffCut` **nowhere**, and §3.4 explains why. The filename
was set by the routing instruction; if the owner prefers, `PREREG-rimfloorup.md` is the clearer
name and the only cost of changing it is doing so **before** this file is pushed.

**Instruments inherited verbatim, not re-derived:** `progress/records/rim/rim-edges.mjs` — the
21 registered edges, `SEARCH 6`, `RIMW 5`, `EXCL 6`, `SPIKE_L 20.0`, `PF_RGBDIST_MIN 8.0`, and
the `spike = RIM − BODY` statistic. One deviation, declared in §5.4 and implemented before any
frame exists: **`i0` is frozen from each shot's own `off` arm** and reused for every arm of that
shot.

**No `src` change. Nothing installed.** Every poked value is a live-read `postfx.tune.*` field —
two fields, `rimStrength` and `rimShadowFloor`, across four poke arms (§4.1). §186 is not engaged.

---

## 0. WHAT THE PARENT LEFT, AND THE TWO THINGS IN `src` THAT RE-READ IT

`RESULT-rim` is VALID and its three verdicts stand. Its **mechanism narrative** does not, in two
places, and both were found by reading `src` against its own numbers rather than by any new
measurement. Both are recorded here **before** this seal's bars, because both change what the
bars should be.

### 0.1 Path B is not under-delivering by 3.3×. It is delivering 100.2% of its own contract.

`RESULT-rim` §4/§6: *"Path B ... delivers 3.87 L of the 12.72 L its own `uRimShadowFloor = 0.45`
contract owes — 30%. ... short by 3.3× in magnitude."* The 12.72 L is `0.45 × 28.27`, i.e. 45% of
the **whole** key-side band. But the shipped line is

```
PostFX.js:1505   float amt = edge.g * uRimStrength * mix( rimFloor, 1.0, edge.b );
```

`rimFloor` multiplies `edge.g * uRimStrength` and nothing else. **It has no access to Path A's
output.** M1 measured Path A carrying 62.3% of that 28.27 L band (`share_surf` 17.60 L). The
denominator the contract actually scales is Path B's own lit-side output, `share_screen` =
28.27 − 17.60 = **10.67 L**.

There is one more term the contract arithmetic omitted, and it is in the line above:

```
PostFX.js:1488   vec3 rimCol = mix( uRimShade, uRimLit, edge.b );   #6fa8d8 -> #7fd4ff
```

The shadow side is not merely 0.45 of the lit side's **amplitude** — it is also drawn in a
**different, dimmer colour**. In display space (`displayColor()`, PostFX.js:2345-2346, so these
are the sRGB-encoded bytes):

```
luma709( #7fd4ff ) = (0.2126*127 + 0.7152*212 + 0.0722*255)/255 = 0.77268
luma709( #6fa8d8 ) = (0.2126*111 + 0.7152*168 + 0.0722*216)/255 = 0.62489
ratio                                                            = 0.80873
```

and one small wrap term, because `c += rimCol * amt * (1 − c)` gives a darker base more of the
add. At the instrument's own measured base levels — mean `BODY` over KEY5 **28.94 L**, over
SHADOW7 **29.33 L** — that ratio is `(1−0.2933)/(1−0.2894)` = **0.99451**.

```
PREDICTED  Sscreen = 0.45  x  0.80873  x  0.99451  x  10.67 L  =  3.862 L
MEASURED   Sscreen =                                              3.870 L      (RESULT-rim §4)
                                                    measured / predicted = 1.002
```

**Path B is on contract to 0.2%.** The "3.3× shortfall" is a denominator error: 0.45 of the wrong
band. Nothing in `src` is broken here; `uRimShadowFloor` is doing exactly what its line says.

This is not a quibble — it decides the seal's whole shape. A term that is 3.3× broken invites a
hunt for the break. A term that is exactly on contract invites a **dose**, and its response is
then predictable in closed form before a single frame exists, which is what §1 does.

### 0.2 The shadow-side "anti-rim" is the ink line, not a sign inversion across AgX.

`RESULT-rim` §4: *"With Path B off, the shadow-side 'rim' band is 3.4 L DARKER than the body it
sits on. Path A alone does not produce a weak rim there — in display space it produces an
*anti*-rim."* §6 generalises it: *"Path A's shadow-side contribution inverts sign across the
transform, +0.222 in linear to −0.19 in display."*

`RIM` is `max L` over the **5 px immediately inside `i0`**, and `i0` is the **ink minimum**. On
Sly the ink is not 2.5 px:

> `PostFX.js:56-58` — *"His inverted-hull shell writes ~2.5 px of ink and the crease pass adds
> its own — measured at **6 px of black on Sly's arm** at 960 wide."*

So the `RIMW = 5` window sits substantially **inside the ink line**. A silhouette carrying no rim
at all therefore reads a **negative** spike, and the size of that negative is a property of the
ink, not of Path A. Three checks, all on numbers already in the record:

1. It varies **4×+ between two daylight frames of the same character**: hero's SHADOW mean is
   **+3.64 L** and sly-profile's is **−2.87 L**, on the shipped build with everything live. Path
   A's shadow-side emission is fixed by shader constants and cannot vary that way between two
   frames of one rig.
2. The ink pass runs **after** the rim in the composite (PostFX.js:1526-1543 vs 1487-1506) and is
   strictly subtractive (`vec3 ink = min( mix(uInkCool, uInkWarm, …), c )`, PostFX.js:1541), so it
   can only pull the band down, never up.
3. The comparison that produced "the sign inverts" is between the `raw` arm and the composited
   arms — and **`raw` has no ink at all**: `debugRaw('scene')` blits the linear scene target and
   returns at step 1b (PostFX.js:2087-2092), before AO, bloom, grade, AgX **and** ink. The two
   arms' `RIM` windows do not contain the same content, so a sign difference between them is not
   evidence about the transform.

**M2 = DOWNSTREAM is untouched by this** — the band is emitted in linear and does not read on
screen, and that is what M2 measured. What is withdrawn is the *mechanism sentence*: "Path A's
shadow-side contribution inverts sign across the transform" is not established, and a large part
of the −3.36 L is the ink's own skirt.

**Consequence for this seal, and it is the reason A1 has the form it has:** the spike statistic
carries a **per-shot negative pedestal** that no dose of any rim term can remove. A level bar on
`shadow/key` cannot see past it (§6.1 shows hero passing a 0.112 level bar on the *shipped*
build). The acceptance is therefore a **change** in that ratio, which cancels the pedestal
exactly.

---

## 1. THE CANDIDATE, AND WHY ITS RESPONSE IS KNOWN BEFORE ANY FRAME EXISTS

**The lever: `postfx.tune.rimShadowFloor`, shipped 0.45.** It is Path B's shadow-side amplitude,
in display space, on the character's silhouette. The parent selected this space; M3 proved this
term live on the character; §0.1 proves it linear and on-contract.

### 1.1 The response is EXACTLY affine in the floor, and that is a property of the shader

```
PostFX.js:1133   float rim = ( clamp( rimMid.x - rimIn.x, 0.0, 1.0 )
                             + clamp( rimOut.x - rimMid.x, 0.0, 1.0 ) * uRimRadius.w ) * … ;  -> edge.g
PostFX.js:1141   float lit = smoothstep( -0.35, 0.45, dot( nView, uKeyDirView ) );            -> edge.b
PostFX.js:1505   float amt = edge.g * uRimStrength * mix( rimFloor, 1.0, edge.b );
PostFX.js:1506   c += rimCol * amt * ( 1.0 - c );
```

Write `b = edge.b`, `F = uRimShadowFloor`, `S = uRimStrength = 0.70`. Then

```
amt(F) = edge.g · S · ( F(1−b) + b )              — affine in F, exactly
Δc(F)  = rimCol · amt(F) · (1 − c)                — c is the PRE-rim value and does not depend on F
```

so the added display RGB, and therefore the added Rec.709 L, is **affine in F**. Four things
have to hold for that to survive to the byte, and each is checkable rather than assumed:

- **No clipping.** `edge.g ≤ 1`: the two clamped terms are `(m−i)` and `0.45(o−m)`, so
  `edge.g ≤ 0.55m + 0.45o ≤ 1`. Hence `amt ≤ S · max(F,1) = 0.70` for `F ≤ 1`, and
  `c + rimCol·amt·(1−c) < 1` for any `c`. **The band cannot clip at any dose this seal uses**,
  which is why the affinity is exact and not "approximately linear away from the top".
- **The ink's own luminance gate is saturated on the scoring edges.** `line *= smoothstep(0.05,
  0.20, lum)` (PostFX.js:1531) makes ink stronger where the pixel is brighter, so on a dim pixel
  a brighter rim recruits more ink and partially cancels itself. On every hero / sly-profile
  SHADOW edge the measured `RIM` L is **26.1–43.7**, i.e. `lum` 0.26–0.44, above the smoothstep's
  0.20 top. The gate is saturated and contributes no nonlinearity there. **On `night` it is not**
  (`RIM` L 9.1–10.3, inside the 0.05–0.20 ramp) — which is one of the reasons `night` carries no
  A-row (§2.2).
- **FXAA runs last on the composite** (PostFX.js:2372-2375) and is a contrast-driven filter, so
  it can re-decide an edge when the band under it changes brightness. This is bounded to ~1 px
  and is the reason M-LIN's tolerance is 1.0 L rather than the 0.784 L quantisation floor (§7.4).
- **`rimFloor` is the uniform itself.** With `uRimFloorOffCut = 0` (shipped) the dilation branch
  at PostFX.js:1493-1504 is **not entered** and `rimFloor = uRimShadowFloor` byte-for-byte.

### 1.2 The slope, from a measured number and nothing else

M3 measured Path B's shadow-side delivery at the shipped floor: `Sscreen = 3.87 L` at
`F = 0.45`. On the SHADOW edges `b ≈ 0`, so `amt ∝ F` and

```
slope = Sscreen / F_shipped = 3.87 / 0.45 = 8.600 L of shadow-side spike per unit floor
```

giving the sealed prediction for the pooled SHADOW7 mean spike:

```
spike(F) = 0.5114 + 8.600 · (F − 0.45)
  F=0.00 → −3.359 L     (reproduces RESULT-rim §4's −3.36 L intercept, from the other direction)
  F=0.45 →  0.511 L     (the measured shipped value)
  F=0.85 →  3.951 L
  F=1.00 →  5.241 L
```

**The one weak link, named here and not buried.** `share_screen` (10.67 L) and `Sscreen`
(3.87 L) exist in the record **pooled only** — there is no per-shot split. Every per-shot
prediction in this file therefore substitutes the pooled slope. The seal does not rely on that
substitution to *score*: **M-LIN and A1 are computed against each shot's own `zero` and `off`
anchors, measured in-run.** The pooled slope is used only to choose the doses (§1.3) and to write
the forecast (§10), and both say so.

The named risk it carries: sly-profile's SHADOW edges are `cap-back` and `tail-right`, on the cap
and the tail. The edge pass suppresses the mask on thin elements —
`thin = smoothstep(0.60, 0.95, rimMid.y)`, PostFX.js:1129 — so sly-profile's own slope may be
**below** pooled. It is the binding shot in §1.3 and the largest single reason the low dose may
miss.

### 1.3 The two doses, derived

A1 (§6) requires the same-frame shadow/key ratio to rise by **≥ 0.112** per shot. With that
shot's own KEY5 mean as the denominator:

```
hero          needs Δ(shadow mean) ≥ 0.112 × 27.543 = 3.085 L  →  F ≥ 0.45 + 3.085/8.600 = 0.8087
sly-profile   needs Δ(shadow mean) ≥ 0.112 × 29.370 = 3.289 L  →  F ≥ 0.45 + 3.289/8.600 = 0.8325
```

- **`d85` — `rimShadowFloor = 0.85`.** The smallest 0.05 step above the binding shot's break-even
  (0.8325). Predicted margin **+4.6%** on sly-profile, **+11.5%** on hero. It is registered as a
  ship candidate *and* as the sharpest available test of the affine model, and §10 gives it
  a 0.35 probability of clearing A1 on both shots precisely because its margin is inside the
  uncertainty of the pooled-slope substitution.
- **`d100` — `rimShadowFloor = 1.00`.** The uniform's **semantic ceiling**: the shadow side keeps
  100% of the lit side's amplitude, and above 1.0 a "floor" is not a floor. Predicted margin
  **+43.8%** (sly-profile) / **+53.3%** (hero).

**Why 1.00 does not destroy the directional read, argued from the numbers rather than asserted.**
The shipped comment's reason for the floor being below 1 is *"little enough that the light still
reads as coming from one direction"* (PostFX.js:216). At `F = 1.00` **Path B's amplitude** is
direction-blind, but (a) `rimCol` stays directional — the shadow side is still drawn in the 19%
dimmer `#6fa8d8`; (b) Path A is untouched and carries 62% of the key-side band with a documented
shadow-side attenuation of 0.112; (c) the predicted total key:shadow spike ratio at `F = 1.00` is
**27.5 : 8.4 on hero** and **29.4 : 1.9 on sly-profile**. The light still reads as coming from one
direction by 3.3× and 15.8× respectively. **This argument is exactly what LOOK-2 (§9) exists to
overrule**, and if a human says the character reads evenly outlined, the dose dies whatever the
numbers say.

**No third dose is proposed and no dose above 1.00 is proposed.** §11 states what the lever cannot
reach.

---

## 2. SHOTS AND ARMS — 18 frames, 3 chunks

### 2.1 Arms (6), in capture order, each applied RESTORE-FIRST from the all-base state

| arm | state | what it is for |
|---|---|---|
| `off` | shipped (`rimShadowFloor 0.45`, `rimStrength 0.70`, `rimFloorOffCut 0`) | the baseline; freezes `i0` and the kept-edge set; the whole of the §5 pre-flight |
| `screenoff` | `tune.rimStrength = 0` | Path B **entirely** off. Gives Path B's own **key-side** output — the denominator §0.1 says the contract actually scales |
| `zero` | `tune.rimShadowFloor = 0` | Path B's **shadow leg** off, lit leg intact. The `F = 0` anchor of the affine model, per shot, and this seal's **in-boot calibration** (§5.2) |
| `d85` | `tune.rimShadowFloor = 0.85` | candidate dose 1 |
| `d100` | `tune.rimShadowFloor = 1.00` | candidate dose 2 |
| `back` | all base restored | the same-boot 0-px bracket against `off` (§302/§303/§331) |

`diff(off, back)` brackets **every** intervening poke of that shot.

**Every arm is a poke of a live-read `tune` field — verified in `src` at this sha (§4.1). No arm
reads a raw buffer, no arm calls `debugRaw` or `debugTerm`, and `V_NORAW` (§5.1) makes that a
checked property rather than an intention.**

### 2.2 Shots: `hero` · `sly-profile` · `night` — and what each does and does not carry

Inherited from `PREREG-rim` §4 unchanged, so the edge list, the coordinates and the reproduced
`off` statistics all transfer.

- **`hero` and `sly-profile` are the SCORING shots.** Each carries KEY5 edges and SHADOW edges in
  the same frame, so each supplies its own denominator. A1, A1p, M-LIN, M-KEY are scored on these
  two and only these two.
- **`night` carries NO A-row, and this is registered in advance so its absence cannot later look
  like a dropped row.** It has one SHADOW edge and its "KEY" edges mean **5.96 L** — a fifth of
  the other shots' — because there is no key on Sly at night at all. A ratio with that denominator
  is noise. `PREREG-rim` §4 excluded `night` from M2 for exactly this reason. `night` carries: the
  off-subject **cost** bars C1/C2 (it is §327's own named glint shot), `PF_NIGHT`, the reported
  per-edge rows, and **LOOK-3**.

### 2.3 Staging, warm-up, force-add — carried verbatim from `PREREG-rim` §4

`setShot(name, {})` with `dt` **UNDEFINED** so the world clock settles live onto the roster's own
value (§328/§330); then freeze, and render every arm with `step(2, 0)` + `renderFrame(0)` so all
six arms of a shot share ONE frozen world state. **Two discarded warm-up renders after staging,
in every chunk, before `off`** (§331) — `convprobe` measured exactly one unconverged render after
staging and `litbleach2` turned `R_sly-key` from 1120 px into 0 px with this warm-up in.
**The bracket bar stays at 0.** `PREREG-rim` got 0 px on all three shots with five arms between;
this seal adds one arm to that stack and does not relax the bar.

**Force-add every completed chunk's frames immediately** (§329.1) — `progress/records/*/**/*.png`
is gitignored and that is exactly how `shots/r13` was lost (`PREREG-rim` §0).

### 2.4 Chunking preserves every bar — the argument, before the capture (§141.1)

| bar | compares | crosses a boot? |
|---|---|---|
| `R_<shot>` | `off` vs `back`, same shot | **no** |
| `CAL_LEVER_<shot>` | `off` vs `zero`, same shot | **no** — and chunking makes it stronger: each boot certifies its own lever |
| `PF_*` | that shot's own `off` | **no** |
| `M-LIN` / `M-KEY` / `M-B` | arms of one shot against each other | **no** |
| `A1` / `A1p` | `R(dose, shot) − R(off, shot)`, same shot | **no** |
| `C1` / `C2` | `off` vs dose, `night` | **no** |
| `C3` | `BODY(off)` vs `BODY(dose)`, same edge, same shot | **no** |
| `V_CHUNK_TREE` | one `src` hash at all three chunk times | by design |

**No bar in this seal compares pixels across shots.**

### 2.5 Frame budget

3 shots × 6 arms = **18 frames**, 3 chunks of 6, one shot per boot.
Per chunk, at today's measured cadence: `4 min boot+stage + 6 min to the first captured arm +
5 × 47 s` = **13.9 min**, inside the ~15 min cap. Adding a seventh arm would put it at 14.7 and
is not done.

---

## 3. THE SPACE AND THE SCOPE — checked before proposing anything (§333)

### 3.1 The space question is already answered, by measurement, and the answer is this term

§333's rule is to ask the space question first. `PREREG-rim` asked it and **measured** the answer
rather than arguing it: `M2 = DOWNSTREAM` (Path A emits 0.222 of its key band on the shadow side
in linear — twice its own documented 0.112 — and it still does not reach the screen) and
`M3 = SCREEN-RIM-LIVE` (Path B contributes 3.87 L there, in display space, on the character).
`RESULT-rim` §6: the lever is **not** `wrapRim` at `toon.glsl.js:1031/1190`; turning Path A up
attacks the half that works.

### 3.2 This seal does not re-open that

M1/M2/M3 are not re-scored here. `screenoff` is present for its denominator, not to re-litigate
M1.

### 3.3 Why not `rimStrength` instead

`uRimStrength` scales **both** sides of Path B (`amt = edge.g · S · mix(F, 1, b)`), so it raises
the key-side band it is being measured against and moves the relative statistic far less per unit
of visible change. `rimShadowFloor` is the only shipped uniform that is **arithmetically inert on
the lit side** — at `b = 1`, `mix(F, 1.0, 1.0) = 1` for every `F`. That inertness is itself a
measurement in this seal (M-KEY, §7.2), not an assumption.

### 3.4 Why `rimFloorOffCut` is used NOWHERE, despite being the obvious partner

Raising the floor globally also raises **architecture's** shadow-side rim, which is §327's
family-3 complaint ("edge-detect christmas-lights on block seams", dunes/night/guard). The
mechanism that exists to scope exactly this — `TUNE.rimFloorOffCut`, PostFX.js:1493-1504 — could
be set to `F − 0.45` to pin the off-subject floor at its shipped value while the character gets
the dose, and it is live-read (PostFX.js:2324), so it would cost no `src` change.

**It is not used, because §327 measured that it does not hold.** `PREREG-rimfloor2`'s
`P_slyrim_CU` and `P_slyrim_PR` — the bars built to prove the character's own rim survives an
off-subject cut — **failed on all four arms**, with the dilated subject mask in place. A mask that
leaks off the character when cutting will leak the same way when raising, and the leak direction
here is "part of the character's rim silently does not receive the dose", which would corrupt the
very slope this seal measures.

So the dose is a **bare global floor**, its off-subject cost is **measured** (C1/C2) rather than
assumed away, and the disposition (§11) is explicit that a character-PASS with an off-subject FAIL
routes to §327's own open request — *"revisit only with a subject-excluding formulation the
P_slyrim control can certify"* — and ships nothing.

---

## 4. THE LEVER IS POKEABLE LIVE — VERIFIED IN `src`, NO EDIT NEEDED

### 4.1 The `tune` fields, and the lines that make each an arm

```
PostFX.js:2321   cu.uRimStrength.value    = this.passes.edge.enabled ? this.tune.rimStrength : 0;
PostFX.js:2322   cu.uRimShadowFloor.value = this.tune.rimShadowFloor;
PostFX.js:2324   cu.uRimFloorOffCut.value = this.tune.rimFloorOffCut;
```

All three sit in the per-frame composite-uniform block and are **re-read on every render** —
`tune.rimShadowFloor` exactly as its sibling `tune.rimStrength`, which `PREREG-rim` already used
as a live arm and which its runner header documents. **There is no clamp, no cache and no
rebuild anywhere on the path**: the only other occurrence of the string `rimShadowFloor` in
`src/` is `ToonMaterial.js`'s unrelated `rimShadowFloorArch` (the *surface* rim's architecture
floor, a different term on a different path). `tune.rimShadowFloor` goes to the uniform
unmodified, at any value.

- `screenoff` is a true OFF **by control flow**: the whole Path-B branch is gated
  `if ( uEdgeEnabled > 0.5 && uRimStrength > 0.0 )` (PostFX.js:1487).
- `zero` is a true shadow-leg OFF **by arithmetic**: `mix( 0.0, 1.0, edge.b ) = edge.b`, so at
  `b = 0` the term is exactly zero and at `b = 1` it is exactly unchanged.
- `d85` / `d100` take the same untaken-branch path as shipped, because `uRimFloorOffCut` stays 0
  in every arm and PostFX.js:1493's `if` is never entered.

**Conclusion: no `src` edit is required for any arm of this seal, and none is proposed.** As with
`PREREG-rim`, there is nothing for the runner to install or restore, which is what lets
`V_CHUNK_TREE` demand one `src` hash across all three boots.

### 4.2 The minimal edit, if one were ever needed — it is not

Recorded only so that "no edit needed" is a claim with an alternative attached rather than an
assertion. If `tune.rimShadowFloor` were *not* live-read, the minimal edit would be one line at
PostFX.js:2322 moving `cu.uRimShadowFloor.value = this.tune.rimShadowFloor;` from `init` into the
per-frame block — the shape `tune.rimFloorOffCut` already has, with its own comment at
PostFX.js:2323 recording the reason ("Re-read per frame like its siblings, so a one-boot A/B can
poke it"). **That edit is already in HEAD. Nothing is proposed.**

### 4.3 The SHIP surface, if anything ships

Exactly **one constant**: `src/render/PostFX.js` `TUNE.rimShadowFloor`, currently `0.45`. Written
only on a PASS, only by the POSTFX owner, only at a clear lock, with this seal's RESULT cited in
the comment at PostFX.js:215-217 (which must also be corrected, since "the shadow side keeps 45%
of the lit side's strength" is the sentence §0.1 shows is measured true and §11 shows is not what
the 12.72 L reading of it meant).

---

## 5. VALIDITY AND PRE-FLIGHT — fail-closed, before any bar is adjudicated

**VOID is not PASS.** Any gate below failing means the rows it covers are VOID and nothing is
claimed from them; a VOID run is archived (`mv progress/records/rimfloor1
progress/records/rimfloor1-void-runN`), diagnosed from readbacks and stamps, and relaunched whole.
No resume.

### 5.1 Validity

| gate | bar | on failure |
|---|---|---|
| `V_ROWS` | 18 rows | **VOID** |
| `V_CHUNKS` / `V_CHUNK_TREE` | 3 chunks present; **one** `src` content hash across all three | **VOID** |
| `V_READBACK` | §40 readbacks taken from the **live uniforms after `renderFrame(0)`**, never from `this.tune`: `uRimShadowFloor` and `uRimStrength` at their commanded values on every row, `uRimFloorOffCut == 0` and `uEdgeEnabled == 1` on **every** row | **VOID** that row's shot |
| `V_NORAW` | `postfx._debugRaw === false` on every captured row. **No arm of this seal reads a raw buffer**, so the parent's `CLIP` gate has nothing to protect — this gate makes that a *checked property* instead of an intention. If any row reads back a raw bypass, its statistics are not display-space and are not this seal's statistics | **VOID** that row's shot |
| `V_OK` | `postfx.ok === true` and zero page console errors at every row | **VOID** — catches a composite that failed to compile and degraded to direct rendering, the one failure mode that yields a plausible frame with none of the pass in it (§210.2) |
| `R_<shot>` ×3 | `diff(off, back) == 0 px` | **VOID** that shot — achievable per §331; `PREREG-rim` got 0/0/0 with five arms between |

**On `CLIP`:** the routing instruction asks for a CLIP gate *if any arm reads a raw buffer*. None
does, by design — every frame here is the full composited display frame, which is the space the
parent's route selected. `V_NORAW` is the fail-closed form of that condition. If a future revision
adds a `raw` arm, `CLIP_<shot>` (< 5% of that shot's measured edge pixels at 255 in any channel,
VOID on failure) comes back with it, at `PREREG-rim` §6's sealed value.

### 5.2 In-boot calibration

The parent's `CAL` proved a **debug bypass** presented an undecoded linear buffer, because M2 read
through one. This seal reads through nothing, so that calibration certifies nothing here. The
thing that must be certified **in this boot, before any bar is adjudicated**, is that *the lever
moves the pixels the seal reads* — and the `zero` arm certifies it directly:

| gate | bar | derivation | on failure |
|---|---|---|---|
| `CAL_LEVER_hero`, `CAL_LEVER_sly-profile` | mean over that shot's SHADOW edges of `spike(off) − spike(zero)` ≥ **1.5 L** | pooled `Sscreen` is 3.87 L and `PREREG-rim` §7's M3 `SCREEN-RIM-LIVE` band was ≥ 3.0 L; **1.5 L is half that**, so a shot carrying only half the pooled effect still certifies its lever | **VOID** that shot — the knob is not connected to the pixels this seal scores, in this boot |
| `CAL_LEVER_night` | whole-frame count of pixels with `\|ΔL\| ≥ 2` between `off` and `zero` ≥ **200 px** | `PREREG-rimfloor2` §4's `BG_char` scoreability floor (200 px), carried; below it a population statistic is noise | `night`'s C1/C2 rows are **NO-CLAIM** (night carries no A-row, so this cannot VOID a ship) |

`CAL_LEVER` is also the `F = 0` anchor of the affine model, so the calibration and the model share
one measurement and cannot drift apart.

### 5.3 Pre-flight — the runner must reproduce the defect first (§328)

All five gates are scored on the `off` arm **before any A, M or C row is computed**. The first
four are `PREREG-rim` §5's, carried at their sealed values, unmoved:

| gate | bar | on failure |
|---|---|---|
| `PF_EDGE` | every registered edge locates `i0` **strictly inside** the ±6 window on `off`, and the **RGB distance** between its BODY and BG channel medians is ≥ **8.0** | that edge is **dropped and named**; **> 3** of the 21 dropping ⇒ **VOID**. `night/torso-right` is expected to drop, PINNED, exactly as it did for the parent |
| `PF_REPRO_KEY` | ≥ **4 of the 5** registered SPIKE edges read `spike ≥ 20.0` on `off`, **and ≥ 4 SPIKE edges survived `PF_EDGE`** | **VOID** — the runner is not staging the frame the defect lives in |
| `PF_REPRO_SHADOW` | **all 7** registered SHADOW edges read `spike < 20.0` on `off` | **VOID** — there is no defect to dose |
| `PF_NIGHT` | every valid `night` edge reads `spike < 20.0` **and** `\|BODY − BG\| ≤ 8.0 L` | **VOID** — `night`'s content moved and it is not the worst case this lineage was aimed at |
| **`PF_RATIO`** (new) | on `off`: `R(sly-profile) ≤ 0.00` **and** `R(hero) ≤ 0.20` | **VOID** — the defect must be present **in this seal's own statistic**, not only in the parent's |

**Derivation of `PF_RATIO`, and why it is one-sided.** The references are the parent's own
reproduced numbers: `R(off, hero) = 3.637/27.543 = +0.132` and `R(off, sly-profile) =
−2.867/29.370 = −0.098`. `RESULT-rim` reproduced every kept edge within **±0.05 L** on a different
tree, which propagates to `|ΔR| ≲ 0.002`. The bars sit **0.098** and **0.068** away from the
references — 34× and 49× that propagated error — because the gate's job is to fail when the defect
is *gone*, not to fail on drift. One-sided in the direction "the shadow side is still at or below
nothing", which is the defect. A two-sided band would VOID on the shot-specific background drift
`RESULT-rim` §1 documented, and `spike` does not use BG at all.

### 5.4 One declared instrument deviation: `i0` is frozen from `off`

`rim-score.mjs` recomputes `i0` (the ink minimum) per frame. Across arms of one shot that is
wrong for this seal: a brighter rim band can move the `argmin`, which would change **which pixels**
the `RIM` window covers and make the arm difference partly an instrument difference.

**Registered: `i0` and the kept-edge set are computed on that shot's `off` arm and reused,
unchanged, for all six arms of that shot.** Same pixels, same window, one uniform different — the
strongest form of §342.2's "the control must be in the same *state*, not merely the same *frame*"
available on this renderer. This is a change to the scorer and it lands **before any frame
exists** (§12), which is the only way §141.1 permits it.

---

## 6. THE ACCEPTANCE BAR — RELATIVE, AND WHY IT MUST BE

### 6.1 The statistic

```
                mean over that shot's SHADOW edges of spike(arm)
R(arm, shot) =  ───────────────────────────────────────────────
                mean over that shot's KEY5   edges of spike(arm)
```

Both terms from the **same frame**, on the **same registered edges**, with `i0` frozen from `off`.

**Why relative and not an absolute display-L figure.** §342.1, on a completely different item:
*"An absolute R/G bar silently imports the albedo of whatever material it was calibrated on. The
successor's bar must be relative — a suppression factor or a hue-angle target — because those are
properties of the shading path rather than of the material that happened to be under it."*
§342.2 then corrected §342.1 with a sharper reason: its "matched control" was in the same *frame*
but a different *lighting state*, and the whole reachability verdict was withdrawn on it.

Both apply here directly. An absolute bar like "shadow-side spike ≥ 4 L" would import Sly's
costume albedo, the shot's exposure, and — through the `(1 − c)` light-wrap at PostFX.js:1506 —
the base level of whatever the band happens to sit on. `R` divides the shadow side by the key side
**on the same character, in the same frame, through the same transform**, so all three cancel to
first order. And per §342.2, the *arm* comparison is state-matched in the strongest available
sense: one frozen world, one uniform changed.

### 6.2 The acceptance is a CHANGE in R, and §0.2 is why

Shipped values, from the parent's reproduced table:

```
R(off, hero)        = +3.637 / 27.543 = +0.132
R(off, sly-profile) = −2.867 / 29.370 = −0.098
```

**A level bar cannot work on this pair, and that is registered here rather than discovered later.**
Any level bar hero can fail (> 0.132) is unreachable for sly-profile at any `F ≤ 1` — its
predicted ceiling is 0.063. Any level bar sly-profile can reach (≤ 0.063) is passed by hero on the
**shipped build**, at more than 2×, before any dose exists. The spread is the ink pedestal of
§0.2, and it is an instrument offset, not a rim quantity.

The delta cancels it exactly, because the pedestal is identical in both terms (same pixels, same
ink, same frozen world):

> **A1 — `ΔR(dose, shot) = R(dose, shot) − R(off, shot) ≥ 0.112`, on `hero` AND `sly-profile`.**

Still relative twice over: a dimensionless within-frame ratio, and a change in it.

### 6.3 Derivation of 0.112 — carried, not invented

**0.112 is `PREREG-rim` §7's `M2 = DOWNSTREAM` band, carried unmoved.** It is the integrated
shadow/lit ratio of the **shipped surface-rim expression** — `toon.glsl.js:1029-1031` and `:1190`
at `uRimPower 3.1`, `smoothstep(-0.35, 0.45, ndl)`, `smoothstep(0.26, 0.58, fres·mix(0.60,1,wrapRim))`,
`mix(0.55,1,sh)`, `mix(0.45,1,wrapRim)` — over `N·V ∈ [0, 0.40]`, by 4000-sample quadrature
(`rim-offline.mjs`; areas 0.0276 / 0.2466).

What the bar says, in words: **whatever fraction of the lit-side rim the shading path's own
constants declare a shadow-side rim is worth, the composited display frame must actually deliver
at least that much, end to end.** It is a property of the shading path, not of the material under
it — §342.1's requirement, met with a number that already exists in this lineage and that has
already been adjudicated against once. A band carried from a parent cannot have been tuned to
this run's frames, which is §141.1's preferred form.

### 6.4 A1p — the matched-part confirmation, and the disagreement rule

Four of the registered edges pair a KEY and a SHADOW reading on the **same body part**, two of
them on literally the same scanline (`hero/chest-front` [403,260] ← / `hero/torso-back` [399,260]
→; `sly-profile/torso-front` [624,270] ← / `sly-profile/torso-back` [662,270] →), plus the two
tail pairs:

```
hero:         (chest-front, torso-back)   (tail-top, tail-right)   Rpair(off) = +0.35 / 27.795 = +0.013
sly-profile:  (torso-front, torso-back)   (tail-top, tail-right)   Rpair(off) = −1.175 / 29.370 = −0.040
```

> **A1p — `ΔRpair(dose, shot) ≥ 0.112`, same bar, on both shots.**

`hero`'s `R(off)` is +0.132 and its `Rpair(off)` is +0.013: **the entire gap is
`hero/glove-right` (+10.21 L)**, the edge `PREREG-rim` §1.3 registered as its own named
counterexample and flagged as sitting where "which way is the key" is the least clean call in the
set. A1p is the aggregate with that edge removed, on matched parts.

> **Disagreement rule, registered:** if A1 and A1p disagree for a dose, that dose is
> **INCONCLUSIVE** and does not ship. It is **not** a licence to quote the row that passed.

### 6.5 What the acceptance does NOT assert

A1 passing does **not** mean §7.3's "No rim light separating silhouettes from the background" is
closed. §11 does that arithmetic explicitly. A1 asserts one thing: the display-space frame now
carries, on the shadow side, at least the fraction of the key-side band the shader's own constants
promise. §7.3 is closed by the LOOK (§9) or not at all.

---

## 7. THE MEASUREMENT ROWS AND THEIR SEALED BANDS

Computed only over edges surviving `PF_EDGE`, only on `hero` and `sly-profile` for M-LIN / M-KEY,
with `i0` frozen from `off`.

### 7.1 M-LIN — is the response affine in the floor? **(this is the claim's falsifier)**

Per shot, the line is anchored on **that shot's own** measured `zero` and `off`:

```
slope(shot)   = [ shadowMean(off) − shadowMean(zero) ] / 0.45
predict(F)    = shadowMean(zero) + slope(shot) · F
```

| outcome | bar |
|---|---|
| **LINEAR** | `\|measured − predict(F)\|` ≤ **1.0 L** at F = 0.85 **and** F = 1.00, on **both** shots |
| **SUPERLINEAR** | measured exceeds predict by > 1.0 L anywhere |
| **SUBLINEAR** | measured falls short of predict by > 1.0 L anywhere |

**Derivation of 1.0 L.** One 8-bit code on the L scale is `100/255 = 0.392 L`; `spike` is a
difference of two L values, so the quantisation floor is `2 × 0.392 = 0.784 L`. Rounded up to
**1.0 L**, and the rounding is spent on exactly one named thing: FXAA (PostFX.js:2372-2375) runs
last on the composite and can re-decide a ~1 px edge when the band under it changes brightness.
No other slack is claimed and none is available afterwards (§141.1).

### 7.2 M-KEY — does the floor leak onto the lit side?

`mix(rimFloor, 1.0, edge.b) = 1` exactly at `edge.b = 1`, so the shipped shader predicts the
key-side band does not move with `F` at all.

| outcome | bar |
|---|---|
| **INVARIANT** | `\|keyMean(F) − keyMean(off)\|` ≤ **1.0 L** at F ∈ {0, 0.85, 1.00}, both shots |
| **LEAKY** | otherwise; the measured leak is reported as `edge.b < 1` on the KEY5 edges |

Same 1.0 L derivation. **`LEAKY` does not invalidate A1** — a moving denominator that grows with
the dose makes `R` *smaller*, so A1 becomes conservative — but its size must be reported, because
`R`'s denominator is the seal's calibration and a calibration that moves with the treatment has to
be stated.

### 7.3 M-B — `edge.b` recovered exactly, per edge (reported)

With `A(b) = edge.g · S · luma(mix(uRimShade, uRimLit, b)) · (1 − c)`, which does **not** depend
on `F`:

```
PathB(F)      = A(b) · ( F(1−b) + b )
ρ (per edge)  = [ spike(zero) − spike(screenoff) ] / [ spike(off) − spike(screenoff) ]
              = b / (0.45 + 0.55 b)
b             = 0.45 ρ / (1 − 0.55 ρ)        — A(b), the colour and the wrap ALL cancel exactly
```

Three arms this seal already needs therefore yield a **direct, closed-form, per-edge measurement
of `edge.b`** — the lit-side mask — with no new frame. Reported for every kept edge.
**NO-CLAIM** for an edge whose denominator is < **1.0 L** (two 8-bit luma codes, 0.784, rounded
up as in §7.1).

This is the row that can explain `hero/glove-right`. If it recovers `b̂ ≈ 0.6` there, that edge is
not shadow-facing and the parent's SHADOW7 set is contaminated — **a finding, recorded, and
explicitly NOT a licence to drop it from any statistic in this seal** (§141.1). It routes the
successor; it does not move a bar here.

### 7.4 M-CONTRACT — Path B against its own contract, in-boot (reported)

```
Rb(shot) = [ shadowMean(off) − shadowMean(zero) ] / [ keyMean(off) − keyMean(screenoff) ]
```

Predicted **0.45 × 0.809 × ≈1.00 = 0.364** (§0.1). The pooled figure it must reproduce is
`3.87 / 10.67 = 0.363`. Reported per shot, not gated — its purpose is to put §0.1's correction of
`RESULT-rim` on this boot's own frames rather than on a re-reading of the parent's table.

---

## 8. THE COST ROWS — what a global floor raise costs off the character

All three are **disqualifiers only**: passing them qualifies nothing, failing one kills that dose.

| id | quantity | band | derivation |
|---|---|---|---|
| `C1` | on `night`, fraction of frame pixels with `\|ΔL\| ≥ 2` between `off` and the dose | ≤ **12%** | `PREREG-rimfloor2` §4 `P_nightbudget`, carried **verbatim** — same shot, same uniform, sealed 2026-08-14. The direction differs (raise, not cut); the quantity — how much of the night frame this knob moves at all — is the same |
| `C2` | on `night`, `speck(lift 14)` population in **NIGHT-L** [90,180,250,520] and **NIGHT-R** [1000,240,1180,420]: `pop(dose)/pop(off)` | ≤ **1.30** each | see below |
| `C3` | on **every** kept edge, all three shots: `\|BODY(dose) − BODY(off)\|` | ≤ **0.8 L** | two 8-bit codes (0.784), **not** rounded up: `BODY` samples sit ≥ 6 px inside `i0` (`EXCL = 6`) while Path B's band ends 4.4 px inside the **depth** silhouette, which itself lies outside the ink — so no part of the band can reach a `BODY` sample and any movement at all is instrument leakage. Fail ⇒ **VOID** that shot: the statistic's own reference moved |

**`C2`'s ROIs and predicate are carried by citation** from `PREREG-seamglint` §3 via
`PREREG-rimfloor2` §3: `speck(lift 14)` = `L ≥ median(11×11 subsampled neighbourhood) + 14 ∧ B ≥ R`.

**`C2`'s band, derived — and its weakness stated in the same breath.** §327 measured that taking
the **screen** floor from 0.45 to 0.10 (Δ = −0.35) removed **~10%** of `night`'s speck population.
This dose is Δ = **+0.55**, i.e. **1.571×** that magnitude in the opposite direction; a linear
extrapolation gives **+15.7%**. The band is set at **+30%**, **1.9×** the extrapolation, and the
extra factor is bought by three named weaknesses: §327's 10% was a *marginal* effect measured on
top of an arch-floor cut; it was measured under `torchlight3` `{dt:0}` staging, not this seal's
live-settle-then-freeze, so the absolute populations are not quotable here; and a **count** is a
threshold crossing, not an amplitude, so it need not scale with the dose at all.

**Because that band is deliberately permissive, the real protection on this population is
LOOK-3 (§9), and it is binding.** `NO-CLAIM` for a ROI whose `pop(off)` < 200 px
(`PREREG-rimfloor2`'s `BG_char` scoreability floor, carried) — in which case LOOK-3 carries that
ROI alone.

---

## 9. BINDING LOOK

Adjudicated in the RESULT, from crops the scorer emits. **A LOOK failure is a NO-SHIP on the dose
it touches, whatever every table says, and it cannot be traded against a passing bar. A LOOK pass
certifies nothing on its own — no dose ships on a LOOK alone.**

1. **`sly-profile.off.png` vs `sly-profile.<dose>.png`, at 1× and 4× on the back, `cap-back` and
   `tail-right`.** A human must see a **cool band appear along the shadow-side silhouette that was
   not there**. *If the two frames are indistinguishable at 4×, A1's PASS for that dose is
   overruled to **NO-CLAIM*** — a term that moves a number and not a frame has not done the job
   §2.1.5 asks for. (Form carried from `PREREG-rim` §9.1, which used it the other way round and
   passed.)
2. **`hero.<dose>.png` and `sly-profile.<dose>.png` at 1×: the key must still read as coming from
   one direction.** This is the shipped comment's own stated reason for the floor being below 1
   (PostFX.js:216), and §1.3 argues from the numbers that it survives at `F = 1.00`. *If the
   character instead reads evenly outlined — rimmed all the way round, a sticker rather than a
   lit form — the dose **FAILS**, whatever A1 says.* This is the one LOOK that can kill a
   mechanically clean ship, and it is aimed at the ceiling dose specifically.
3. **`night.off.png` vs `night.<dose>.png` at 1× and 3× on the wall and the deck edge.**
   Architecture must not acquire new seam glints (§327 family 3), **and** the rooftop must still
   separate — `PREREG-kerb`'s V3 lesson is that the second half is the one that dies quietly.
   *Visible new cyan pepper on the wall ⇒ the dose **FAILS**, regardless of C1/C2*, because C2's
   band is knowingly permissive (§8).
4. **`hero.<dose>.png` at 1×:** no new bright fringe on the kerb / step-lip band `PREREG-kerb`
   named. *Fail ⇒ the dose fails.*

---

## 10. REGISTERED FORECAST — probabilities, and ONE refuting condition

Written before any frame exists. The probabilities are mine and are recorded so they can be
wrong on the record; `RESULT-rim` got all three of its forecasts wrong with a valid instrument,
which is the entire reason forecasts are registered separately from bars.

| row | forecast | p |
|---|---|---|
| `M-LIN` | **LINEAR** | **0.85** |
| `M-KEY` | **INVARIANT** | **0.55** |
| `A1` + `A1p` at `d100` | **PASS on both shots** | **0.70** |
| `A1` + `A1p` at `d85` | **PASS on both shots** | **0.35** |
| `C1` at `d100` | **PASS** (≤ 12%) | **0.60** |
| `C2` at `d100` | **PASS** (≤ 1.30) | **0.50** |
| **ships anything** | `d85` or `d100` clears every bar **and** all four LOOKs | **0.40** |

**M-LIN 0.85.** The affine form is a property of the shader's expression, not a fit: `amt` is
affine in `F` by construction, `edge.g ≤ 1` bounds `amt ≤ 0.70` so the band never clips, and the
ink's luminance gate is saturated on every scoring edge (`RIM` L 26.1–43.7 against a 0.20 top).
The 0.15 is FXAA and the possibility that `night`'s unsaturated ink gate has an analogue on some
scoring edge I have mis-read.

**M-KEY 0.55, and I expect this one to be the interesting row.** `edge.b` is a `smoothstep` of a
**screen-space normal** against the key direction, but `PREREG-rim` labelled its edges KEY/SHADOW
from the frame's key **azimuth**, not from a measured `edge.b`. Three of the five KEY5 edges are
cap-top / tail-top readings where the view normal at the silhouette can sit well off the key. If
`edge.b` is 0.5–0.8 there, the key band moves with the dose and M-KEY reads LEAKY. M-B (§7.3)
measures it either way, and A1 is conservative under leakage.

**A1 at `d100` 0.70.** For: the slope is anchored on a measured 3.87 L that itself reproduces a
closed-form prediction to 0.2% (§0.1), and the predicted margins are +43.8% / +53.3%. Against:
the slope is **pooled** and the binding shot is sly-profile, whose two SHADOW edges sit on the cap
and the tail where `thin = smoothstep(0.60, 0.95, rimMid.y)` can suppress `edge.g` outright — a
below-pooled slope there eats the margin fastest.

**A1 at `d85` 0.35.** Its predicted margin on the binding shot is **+4.6%**, which is inside the
uncertainty of the pooled-slope substitution. It is registered as a ship candidate anyway because
the ship rule takes the smallest sufficient dose, and because a dose that lands within 5% of a bar
is the sharpest test of the model this seal can buy.

**Ships anything, 0.40.** The product of an A-row that is likelier than not, a `C2` coin flip on a
band derived from a weak extrapolation, and four binding LOOKs of which #2 is aimed squarely at
the dose most likely to clear A1.

### The single condition that would refute my reading of this file

> **`M-LIN ≠ LINEAR`** — the measured shadow-side mean spike at `F = 0.85` **or** `F = 1.00`
> departs by more than **1.0 L** from the line through this run's own `zero` and `off` anchors,
> on **either** scoring shot.

One condition, one row, no co-firing requirement. It is exactly the content of the claim: *Path
B's shadow-side output is affine in `uRimShadowFloor` with a slope fixed by its own lit-side
output, and the shortfall `RESULT-rim` attributed to a broken contract is a denominator error.*
If it fires, the affine model is wrong, every dose in this file was derived from a wrong model,
and §11's disposition makes that cost a ship rather than a paragraph.

**Why it is written this narrowly, explicitly.** `PREREG-rim` §10 registered a **compound**
refuter — *"`M2 = DOWNSTREAM` with `M3 = SCREEN-RIM-INERT`"* — when `M2 = DOWNSTREAM` alone
refuted its §3. The compound did not fire, and `RESULT-rim` §3 recorded that as *"I bolted a
second condition onto a refutation that did not need it, which made my own falsifier harder to
trigger than the claim deserved."* This falsifier names **one** row.

**And what is deliberately NOT the falsifier:** `A1` failing at both doses. That would mean the
lever is too small — a **reachability** result, which §11 already predicts is possible and which
§1.3 derived the doses against. Reachability is not a refutation of the model, and pretending it
is would make the falsifier *easier* than the claim, which is the same error in the other
direction.

---

## 11. WHAT THIS SEAL DOES NOT DO

Stated plainly, because §6.5 is the sentence most likely to be misquoted later.

1. **It does not close §7.3's "No rim light separating silhouettes from the background", and it
   cannot.** "A rim is present" is `spike ≥ 20.0 L` (`PREREG-rim` §1.3(b), a threshold sitting
   inside a measured 13.3 L empty gap), which is **0.707** of the key-side band. Putting the
   shadow edges there needs `F = 2.35` (hero) / `F = 3.11` (sly-profile). Reading `src`'s own
   sentence — *"it carries its own shadow-side floor. That is where the shadow-side rim lives
   now"*, `toon.glsl.js:1210-1212` — as 0.45 of the **whole** band needs `F = 1.87`. **All three
   are out of the lever's range.** This seal buys a fraction. It does not buy the checkbox.
2. **It does not touch Path A.** No `wrapRim`, no `uRimGain`, no `toon.glsl.js`, nothing in
   SHADING. `RESULT-rim` established Path A already emits 2× its documented shadow-side band.
3. **It does not use `rimFloorOffCut`** (§3.4), so it does **not** claim the off-subject
   population is protected. It measures the cost and lets it disqualify.
4. **It does not re-score M1 / M2 / M3.** `screenoff` is here for a denominator.
5. **It scores no A-row on `night`** (§2.2), the critic's named worst case. `night` carries cost,
   pre-flight and LOOK only. A dose that helps hero and sly-profile and does nothing at night has
   **not** been shown to help the worst case, and this seal cannot show it.
6. **It cannot separate `edge.b` from the floor on the key side.** M-KEY reports the joint effect
   and M-B recovers `b` per edge; neither is a bar.
7. **It changes no `src` byte during the capture window and installs nothing.** On PASS the ship
   surface is **one constant** (§4.3).
8. **It does not re-open `RESULT-rim`'s verdicts.** §0.1 and §0.2 correct two *mechanism
   sentences*; M1 SHARED, M2 DOWNSTREAM and M3 SCREEN-RIM-LIVE stand exactly as recorded.

---

## 12. DISPOSITION, SHIP RULE, AND WHAT REGISTRATION REQUIRES

### 12.1 Registration is not complete until these exist

This file is a **DRAFT** until all three are committed and pushed **together**, at one sha, with
`progress/records/rimfloor1/` non-existent at that sha:

1. this file;
2. `progress/records/rimsucc/rimfloor-run.mjs` — the runner. It is
   `progress/records/rim/rim-run.mjs` with the arm table replaced (`ARMS = ['off','screenoff',
   'zero','d85','d100','back']`, `EXPECT_ROWS = 18`) and the four `debugRaw`/`debugTerm` calls
   removed; staging, warm-up, readback-from-live-uniform, tree stamps, `PF6`/`PF7` launch pins
   and the force-add discipline are carried unchanged;
3. `progress/records/rimsucc/rimfloor-score.mjs` — the scorer, importing `EDGES` and the
   statistic from `progress/records/rim/rim-edges.mjs` unchanged, adding the §5.4 frozen-`i0`
   deviation, the §5 gates, §6's A-rows, §7's M-rows and §8's C-rows.

`progress/records/rimsucc/rimfloor-derive.mjs` (committed with this draft) reproduces **every
number in this file** from the parent's measured rows and the shipped constants, so the seal's
derivation and its verdict cannot drift apart. It reads no frame.

### 12.2 Ship rule — registered, and evaluated in this order only

The **first** dose in the order **`d85`, then `d100`** that passes **all** of:

`A1` ∧ `A1p` on both scoring shots · `C1` · `C2` · `C3` · all four §9 LOOKs

ships, and only that one. Smallest sufficient intervention first — `PREREG-kerb`'s registered-rule
form. **If neither qualifies, NO SHIP:** `TUNE.rimShadowFloor` stays at `0.45` and the measured
per-shot line routes the successor.

### 12.3 Outcome branches

- **Any `V_*`, `CAL_LEVER` (hero / sly-profile) or `PF_*` gate FAILS ⇒ VOID.** Nothing is claimed
  about any dose. Archive, diagnose, relaunch whole. VOID is not PASS.
- **`M-LIN ≠ LINEAR` ⇒ the model is refuted and NO DOSE SHIPS**, even one whose A-row passed —
  because every dose in this file was derived from that model. The A/M/C rows are still scored and
  reported in full, and the successor picks its dose from the measured line rather than from mine.
  *A falsifier that costs nothing is not a falsifier.*
- **`A1` and `A1p` disagree at a dose ⇒ INCONCLUSIVE** for that dose; it does not ship (§6.4).
- **A LOOK fails at a dose ⇒ that dose is dead**, whatever its tables say (§9).
- **A-rows pass and `C1`/`C2`/LOOK-3 fail ⇒ NO SHIP, and the finding routes to §327's own open
  request:** *"revisit only with a subject-excluding formulation the `P_slyrim` control can
  certify."* That is a real successor, and this seal would have supplied it with the character's
  measured dose-response line — which is exactly what §327 lacked.
- **All bars pass and a dose ships ⇒** `TUNE.rimShadowFloor` moves, once, by the POSTFX owner, at
  a clear lock, with this RESULT cited at PostFX.js:215-217.

### 12.4 §141.1, absolute

No band, threshold, dose, edge coordinate, ROI or tolerance in this file moves once a frame
exists. Fixed now, in advance: the **0.112** acceptance fraction; the **0.85 / 1.00** doses; the
**1.0 L** M-LIN / M-KEY tolerance; the **0.8 L** `C3` bar; the **1.5 L** and **200 px**
`CAL_LEVER` bars; `PF_RATIO`'s **0.00 / 0.20**; `C1`'s **12%**; `C2`'s **1.30** and **200 px**;
and the inherited **20.0 L**, **±6 px**, **RIMW 5**, **EXCL 6**, **8.0 RGB** instrument constants.
If the fresh `off` arm makes any of them look badly chosen, **that is a finding to write down, and
a re-seal is a NEW file.**

# PREREG-rim — which rim path owns the character's silhouette, and in which space the shadow side is missing

**Lane:** SHADING ↔ POSTFX (the seal decides which). **Date sealed:** 2026-08-15.
**Ancestry:** AGENTS.md §2.1.5 ("the single biggest AAA tell") + §7.3 "No rim light separating
silhouettes from the background" → rim1/rim2/rim3 → §327 (rimfloor2 / fxghost2 DO NOT SHIP) →
**critic r13's #2 ranked problem** (§328) → §331 (warm-up) → §332/§333 (the space discipline this
seal is built to obey). Critic verbatim: *"There is no fresnel rim — what looks like rim is the key
light's own highlight. 8 of 13 measured silhouette edges show no spike, and all 5 that do are on
the key-facing side (hero front yes / back no; sly-profile cap yes / tail no). The shadow-side
silhouette, the only one that needs separating, never has one. Worst case night: Sly at interior
L 20 against background L 29."*

**Status: REGISTERED before any capture.** `progress/records/rim1/` does not exist at this sha and
no frame of any arm has been rendered.

**Frame count: 15** (§329.1) — 3 shots × 5 arms, **chunked one shot per boot, 5 frames per chunk**,
plus **2 discarded warm-up renders after staging in every chunk** (§331). Each chunk is well inside
the observed container life.

**No `src` change.** Every arm is a poke of an existing live-read uniform or an existing debug hook.

---

## 0. The frames this seal was derived from, and the one thing that is NOT reproducible

The critic measured `shots/r13`. **Those PNGs no longer exist**: `shots/*/` is gitignored
(`.gitignore`, "only the latest curated set is committed"), they were never force-added, and
rollback destroyed them. They are not in `origin/claude/sly-cooper-ancient-egypt-0koo0u` either —
only `progress/records/logs/critic-r13.log` survives, and it carries draw/tri counts, not pixels.

Every number in §1 was therefore measured by me on **`shots/r12`** (sha `0525d5e`+dirty,
2026-08-13T23:46Z, 1280×720). That substitution is argued, not assumed:

- **The rim math is byte-identical between the two captures.** `git diff 0525d5e de3080d --
  src/render/{shaders/toon.glsl.js,PostFX.js,ToonMaterial.js}` contains exactly **one** deleted
  line in the whole range — `float amt = edge.g * uRimStrength * mix( uRimShadowFloor, 1.0,
  edge.b );` — replaced by the same expression behind `if ( uRimFloorOffCut > 0.0 )` with
  `TUNE.rimFloorOffCut = 0.0`, i.e. an exact no-op **by control flow** (PostFX.js:1489-1505).
  Everything else in those three files is pure insertion of gated-off mechanisms.
- **§328 independently reports that r13 reproduces the r12 calibration to three decimals** on the
  other open defect ("the defect never moved and the seal's bars were correctly aimed").
- **What r12 cannot stand in for:** `Guard.js` (+348/−), `Particles.js`, `Props.js`, `PropKit.js`
  and `CarmelitaGuard.js` all changed between the two captures, so frame *content* away from Sly
  may differ. My edges are all on Sly. `night` in particular has scored 6 → 3.5 → 5 across three
  blind raters (§328), so its content is the least stable of the three.
- **I could not reproduce the critic's `L 20` / `L 29` night pair on r12 at all** (see §1.3). I am
  not going to invent a definition of `L` that makes it fit. The critic's *pattern* reproduces
  exactly; that one pair does not, and it is recorded as unreproduced rather than quietly dropped.

`PF_REPRO` (§5) exists because of all of the above: **this seal refuses to adjudicate anything
until its own `off` arm reproduces the defect on the current tree.** That is §328's rule —
*"a seal's runner must be proven to REPRODUCE the defect before its bars are sealed"* — applied as
a pre-flight rather than discovered post-hoc.

---

## 1. WHAT I MEASURED — the defect, in numbers, offline

### 1.1 The instrument

`progress/records/rim/rim-edges.mjs`, reproduced by `node progress/records/rim/rim-offline.mjs`.
For each registered edge a ray is walked from **deep inside Sly** to **deep in the background**,
axis-aligned, `inner` px in and `outer` px out of a registered nominal boundary:

- `i0` — the **ink minimum**: `argmin L` within **±6 px** of the nominal boundary. The inverted-hull
  outline is near-black and lies on every character silhouette, so it is the one landmark that is
  present whether or not a rim is. An `i0` pinned to either end of the search window means the ink
  was **not found** and the edge is **instrument-invalid**.
- `RIM` — `max L` over the **5 px immediately inside** `i0`. Sized from the two rim terms' own
  contracts: PostFX's band is `rimInner 1.2 → rimOuter 4.4` px (PostFX.js:69-72) and the critic
  logged the surface band as "2 px cyan" (toon.glsl.js:1010).
- `BODY` / `BG` — **medians** of the inside / outside samples, **excluding 6 px either side of
  `i0`**, so the rim band cannot leak into its own reference.
- **`spike = RIM − BODY`** — the statistic. `sep = RIM − BG`. `dCool = (B−R)|RIM − median(B−R)|BODY`.

`L` is Rec.709 luma on the sRGB bytes, scaled to 0–100 (`(0.2126R+0.7152G+0.0722B)/2.55`).

### 1.2 The 21 registered edges, measured on `shots/r12`

`face` = which way the edge's outward normal points. In `hero` and `sly-profile` the key rakes from
up-and-left (both frames' lit sides are left/top, and the paired front/back and top/right readings
below are what establish it); `night` has no key on Sly at all.

| # | edge | face | BODY | BG | RIM | spike | sep | dCool | RIM rgb |
|---|---|---|---|---|---|---|---|---|---|
| 1 | `hero/cap-top` | KEY | 14.6 | 22.1 | 41.7 | **+27.0** | +19.5 | +35 | (65,112,171) |
| 2 | `hero/muzzle-front` | KEY | 41.3 | 21.1 | 40.5 | −0.7 | +19.5 | +8 | (124,98,96) |
| 3 | `hero/chest-front` | KEY | 37.3 | 17.5 | 65.7 | **+28.5** | +48.2 | −16 | (118,177,220) |
| 4 | `hero/torso-back` | SHADOW | 30.5 | 20.6 | 31.8 | +1.3 | +11.2 | −11 | (35,87,158) |
| 5 | `hero/tail-top` | KEY | 30.9 | 71.2 | 58.1 | **+27.1** | −13.1 | +57 | (127,153,161) |
| 6 | `hero/tail-right` | SHADOW | 35.4 | 57.3 | 34.8 | −0.6 | −22.5 | +22 | (94,87,92) |
| 7 | `hero/glove-left` | KEY | 33.5 | 18.6 | 39.8 | +6.2 | +21.2 | +33 | (47,109,186) |
| 8 | `hero/glove-right` | SHADOW | 33.5 | 19.6 | 43.7 | +10.2 | +24.0 | −6 | (63,118,188) |
| 9 | `sly-profile/cap-top` | KEY | 34.8 | 40.0 | 40.9 | +6.1 | +0.9 | −4 | (56,111,180) |
| 10 | `sly-profile/cap-front` | KEY | 36.2 | 52.9 | 41.7 | +5.5 | −11.2 | −73 | (89,110,121) |
| 11 | `sly-profile/cap-back` | SHADOW | 34.7 | 42.7 | 28.5 | −6.2 | −14.2 | −3 | (27,78,153) |
| 12 | `sly-profile/muzzle-front` | KEY | 48.4 | 37.9 | 43.4 | −5.0 | +5.5 | +17 | (142,103,93) |
| 13 | `sly-profile/torso-front` | KEY | 35.3 | 36.9 | 65.3 | **+30.0** | +28.4 | −44 | (119,177,203) |
| 14 | `sly-profile/torso-back` | SHADOW | 32.7 | 34.8 | 33.7 | +1.1 | −1.0 | −18 | (45,91,158) |
| 15 | `sly-profile/tail-top` | KEY | 26.6 | 42.3 | 55.3 | **+28.7** | +13.0 | +43 | (121,145,161) |
| 16 | `sly-profile/tail-right` | SHADOW | 29.5 | 36.7 | 26.1 | −3.4 | −10.6 | +7 | (75,64,67) |
| 17 | `night/cap-top` | KEY | 11.4 | 13.5 | 14.8 | +3.4 | +1.3 | −30 | (45,35,42) |
| 18 | `night/head-front` | KEY | 10.1 | 6.7 | 23.8 | +13.7 | +17.1 | −3 | (56,61,72) |
| 19 | `night/glove-top` | KEY | 8.3 | 4.8 | 9.1 | +0.8 | +4.3 | −2 | (0,25,74) |
| 20 | `night/glove-right` | SHADOW | 9.0 | 12.3 | 10.3 | +1.3 | −2.0 | −4 | (6,27,78) |
| — | `night/torso-right` | SHADOW | — | — | — | — | — | — | **PINNED — instrument-invalid** |

### 1.3 What those numbers say

**(a) The critic's count reproduces, independently and almost exactly.** Taking "a spike" at
**≥ 20.0 L** (derivation below): **5 of the 20 valid edges spike.** The critic measured 5 of 13.
I probed eight more edges than the critic and found **not one additional spike** — the extra
probes all landed in the no-spike population.

**(b) The threshold is not invented — the population is bimodal with an empty band 13.3 L wide.**
Highest non-spiking edge: `night/head-front` **+13.7**. Lowest spiking edge: `hero/cap-top`
**+27.0**. Nothing lies between. **20.0 L** sits inside that gap, 6.3 above the highest NO and 7.0
below the lowest YES. §141.1: it does not move once a frame exists.

**(c) All 5 spikes are key-facing, and 0 of 7 valid shadow-facing edges spike.**
`hero` front **+28.5** / back **+1.3**; `sly-profile` front **+30.0** / back **+1.1**;
`hero` tail-top **+27.1** / tail-right **−0.6**; `sly-profile` tail-top **+28.7** / tail-right
**−3.4**. The critic's front-yes/back-no pairing is reproduced on both shots. The **mean** spike
over the 7 valid shadow-facing edges is **+0.53 L** — against a key-facing mean of **28.27 L**,
that is **1.9%**. Both rim paths together deliver half a display L of shadow-side separation.

**The nearest thing to a counterexample, named rather than buried:** `hero/glove-right` at
**+10.2 L** is the largest shadow-facing reading and it is cool ((63,118,188), `dCool` −6). It is
still 9.8 L under the threshold and 36% of the key-facing mean, and it sits on Sly's outstretched
hand where "which way is the key" is the least clean call in the set. It is registered as
SHADOW-facing and it is what makes `PF_REPRO_SHADOW`'s 20.0 L bar a real test rather than a
formality.

**(d) One correction to the critic's stated MECHANISM.** *"What looks like rim is the key light's
own highlight"* is not what the pixels say. All five spiking bands are **cool**:
(65,112,171) · (118,177,220) · (127,153,161) · (119,177,203) · (121,145,161) — B exceeds R by
48–106 in every one. On the three non-blue substrates `dCool` is **+35 / +57 / +43**; on the two
blue-costume edges the band is *paler* than the costume it sits on, which is what adding
`#7fd4ff` (B−R = 128) to a lapis costume (B−R ≈ 142) does. The key is `#ffd9a0` (B−R = **−95**);
nothing here looks like it. **A rim-coloured term is firing — it just only fires key-side.** The
critic's conclusion (no shadow-side separation) stands; the attributed cause does not.

**(e) `night` is the worst case, quantitatively.** Every valid night edge: spike ≤ **+13.7**, and
character-vs-background separation `|BODY − BG|` of **2.1 / 3.4 / 3.5 / 3.2 L** (cap-top,
head-front, glove-top, glove-right). Sly is inside 4 L of his background on every night silhouette
measured. **I could not reproduce the critic's specific `L 20` vs `L 29`** on r12 under Rec.709
luma (mine: BODY 8.3–14.7, BG 4.7–13.5), CIE L\* or HSL L; recorded as unreproduced (§0).

**(f) `night/torso-right` is PINNED, and that is a finding rather than a miss.** The boundary
finder locates the ink by `argmin L`; on that edge the ink and the background are **both** near
black, so no minimum exists inside the search window and the walk just decays monotonically from
L 14.7 to L 4.7. There is *no luminance feature of any kind* at that silhouette — no rim, and no
readable ink either. It is registered as instrument-invalid and excluded from every statistic.

---

## 2. THE TWO RIM PATHS — which one produces what §1 measured

There are exactly two, and they live in different spaces. Line numbers are at this sha.

### Path A — the surface fresnel rim. SHADING. **scene-linear, pre-AgX.**

```
toon.glsl.js:1029  float fres     = pow( 1.0 - ndv, uRimPower );                    uRimPower 3.1
toon.glsl.js:1030  float wrapRim  = smoothstep( -0.35, 0.45, ndl );
toon.glsl.js:1031  float rimBand  = smoothstep( 0.26, 0.58, fres * mix( 0.60, 1.0, wrapRim ) );
toon.glsl.js:1162  float rimMag   = smoothstep( uRimCurve.x, uRimCurve.y, slyTurn );  uRimCurve (3,10,1)
toon.glsl.js:1165  float rimSil   = rimMag * slyConvex;      // rimSkinExempt 1.0 → convexity waived on Sly
toon.glsl.js:1189  float rimShadeFloor = mix( uRimShadowFloorArch, 0.55, vSlySkin ); // 0.55 on Sly
toon.glsl.js:1190  vec3  rim = uRimColor * ( uRim * uRimGain * rimBand * rimSil
                                             * mix( rimShadeFloor, 1.0, sh )
                                             * mix( 0.45, 1.0, wrapRim ) );          uRim 0.55 · uRimGain 4.10
toon.glsl.js:1216  outgoingLight = diff + sss + spec + metalEnv + rim + emissiveTerm;
```

`outgoingLight` is written to the linear HDR scene target and only then meets AO, bloom, the grade
and AgX. **Path A is exposed to the display transform in full.**

**Its shadow-side behaviour is not a bug, it is the shipped design, and it is severe.** Evaluating
lines 1029-1031/1190 over N·V with `rimSil = 1` (`rim-offline.mjs`, arithmetic only, no capture):

| | LIT (`wrapRim` 1, `sh` 1) | SHADOW (`wrapRim` 0, `sh` 0) | ratio |
|---|---|---|---|
| peak amplitude at N·V = 0 | 1.0000 | 0.2475 | **0.248** |
| band onset (`rimBand` > 0) | N·V = 0.352 | N·V = 0.236 | — |
| band saturation | N·V = 0.161 | N·V = **0.011** | — |
| **area over N·V ∈ [0, 0.40]** | 0.2466 | 0.0276 | **0.112** |

The `mix(0.55,1,sh) · mix(0.45,1,wrapRim)` legs cut the peak to **24.75%**, and the
`mix(0.60,1,wrapRim)` *inside* the `smoothstep(0.26,0.58,·)` cuts the band's angular **width** on
top of that: on the shadow side the term only reaches its (already quartered) full strength within
**0.6° of grazing**, a sub-pixel condition on a low-poly skinned silhouette. Integrated over the
band, **the surface rim delivers 11.2% on the shadow side of what it delivers on the lit side.**

### Path B — the screen-space silhouette rim. POSTFX. **display space, post-AgX.**

```
PostFX.js:1125-1135  rimIn/rimMid/rimOut = slyBackStep(...)  →  edge.g, purely a DEPTH band
PostFX.js:1140-1141  float lit = smoothstep(-0.35, 0.45, dot(nView, uKeyDirView));  →  edge.b
PostFX.js:1143       gl_FragColor = vec4( line, rim, lit, 1.0 );
PostFX.js:1453       c = slyLinearToSrgb( c );          ←──── everything below is DISPLAY SPACE
PostFX.js:1488       vec3  rimCol = mix( uRimShade, uRimLit, edge.b );   #6fa8d8 → #7fd4ff
PostFX.js:1505       float amt    = edge.g * uRimStrength * mix( rimFloor, 1.0, edge.b );
PostFX.js:1506       c += rimCol * amt * ( 1.0 - c );                    rimStrength 0.70, floor 0.45
```

Path B's mask is **geometric** — it keys off a depth step, so it does not care which way a normal
points and its band does **not** narrow on the shadow side; only the amplitude drops, to
`uRimShadowFloor = 0.45`. `toon.glsl.js:1210-1212` states in `src/` that Path B *"carries its own
shadow-side floor. **That is where the shadow-side rim lives now.**"*

**§1(c) is a direct prediction failure for that sentence.** If Path B owned the key-side band
(mean **28.27 L**) its own contract owes 45% of it — **12.7 L** — on the shadow side. Measured
shadow-side mean: **+0.53 L**, maximum **+10.2 L**. Whatever Path B is doing on the character, it is not that. The
only prior number for it points the same way: PostFX.js:101 records `screenonly` measuring
identical to `norim`, *"box mean add 0.1/0.3/0.3 — nothing"* — but that was measured **on
architecture** (hero's step-lip box), never on the character's shadow-side silhouette. **This seal
measures it there.**

### Which path owns the measured key-side band — the arithmetic that makes it a real question

`hero/chest-front` band pixel (118,177,220) over costume (43,93,172): Δ = (+75,+84,+48). Path B's
maximum possible display contribution there is `rimCol · 0.70 · (1−c)` with `rimCol = #7fd4ff`,
`c = (0.169,0.365,0.675)` → **(+74,+94,+58)**. The measured band is inside ~10 bytes of Path B's
own ceiling — so **Path B alone could account for the entire key-side spike**, and so could Path A.
Offline arithmetic cannot separate them. **That is measurement M1.**

---

## 3. THE SPACE — checked BEFORE proposing anything, per §333

§333 established that three seals burned aiming in-shader levers at a defect the shader does not
produce: the costume leaves the shader at linear chroma **0.873** and reaches the screen at
**0.205** — AgX plus `saturation 1.30` destroy **76.5%** of it. The rule that came out of it is to
ask the space question first. Asked here, **the answer comes out the other way, and the reason is
that this defect is a different quantity on a different part of the curve.**

`PostFX.debugRaw('scene')` presents the linear scene pre-AgX. **I cannot run it** — this lane
captures nothing — so the argument below is arithmetic on the shipped constants, and the seal
**measures** the thing it argues rather than resting on it.

**The transform's gain on an additive linear increment is monotonically DECREASING in the base
level.** Transcribing the shipped composite (PostFX.js:1424-1453 + `passes/Common.js` `slyAgX`)
into `rim-offline.mjs` and adding a fixed linear increment `k · uRimColor` on a lapis base:

```
  display L of base      +k=0.02      +k=0.05      +k=0.10     gain (dL per unit linear, at k=0.02)
        3.5               +8.1        +16.4        +26.2                403
       10.4               +6.2        +12.8        +21.6                309     <- night Sly (BODY 8-15)
       16.8               +4.3        +10.1        +17.4                216
       27.8               +3.0         +6.9        +12.5                150     <- shadow-side BODY ~30
       39.1               +2.0         +4.6         +8.4                101     <- key-side BODY ~35
       52.8               +0.8         +2.3         +4.4                 41
       78.2               +0.4         +0.4         +1.1                 18
```

**A rim of identical scene-linear magnitude on a shadow-side pixel arrives on screen ~3.1× MORE
visible than on a key-side one** (309 vs 101 at the two BODY levels §1 measured), and ~1.5× more
at the shadow-side level itself (150 vs 101). This is structural, not a fitted curve: AgX works in
`log2`, whose slope `1/(v ln2)` diverges as `v → 0`, and the sRGB encode is concave on top.

**Therefore the display transform cannot be what removes the shadow-side rim. It is the one term
in the chain that is *biased in the defect's favour*.** §333 does not transfer: it measured
**chroma** on a **bright** pixel, where AgX's shoulder and `saturation 1.30` genuinely destroy the
signal; this measures **luminance** on a **dark** pixel, where the same curve amplifies it.
Applying §333's conclusion here would be §326's and §312's error — *a quantity derived in one
space applied in another* — with the sign flipped.

**Honest limit on that transcription.** It omits AO and bloom (`PostFX.js:1405-1421`), which are
per-pixel and unavailable offline. Run against §333's own numbers it reproduces the *direction*
of the chroma loss but under-predicts its size (linear chroma 0.873 → **0.55** at display L 137,
a 37% loss, against §333's measured 76.5%). **It is used for the sign and the rank of the gain
only, never for an absolute prediction, and no acceptance band in §7 is derived from it.**

**So the fix must operate wherever the shadow-side band FAILS TO BE GENERATED, and this seal's
whole job is to say which of the two generators that is:**

- If **Path A** is emitting its documented 11.2% in linear and it still does not read, the deficit
  is downstream and the lever is **display-space / POSTFX** — §333's route, for a different reason.
- If **Path A** is emitting far less than 11.2%, it is gated off **in linear** and the lever is
  the `wrapRim` pair at toon.glsl.js:1031/1190 — **SHADING**, and §333 explicitly does not apply.
- If **Path B** is inert on the character, then `src`'s own claim that the shadow-side rim "lives
  there now" is false, and the lever is **display-space / POSTFX** regardless of Path A.

Those three are M2, M2 and M3. **No candidate, no dose and no `TUNE` value is proposed in this
file** — proposing one before this measurement is the exact mistake §333 was written about.

---

## 4. ARMS, SHOTS AND STAGING — 15 frames, 3 chunks

| arm | state | what it isolates |
|---|---|---|
| `off` | shipped render | the defect baseline; the pixel set and `i0` for every edge |
| `screenoff` | `postfx.tune.rimStrength = 0` | **Path A alone, in display space.** `off − screenoff` = Path B's display contribution |
| `raw` | `postfx.debugRaw('scene')`, `shading.debugTerm(0)` | **Path A alone, in scene-linear.** Path B is composited after this buffer and is absent from it by construction |
| `cal` | `debugRaw('scene')`, `shading.debugTerm(4)` | the bypass proves itself **in this boot**: the PNG must read (64,128,191) |
| `back` | shipped render, everything restored | the §302/§331 same-boot 0-px bracket against `off` |

`postfx.tune.rimStrength` is re-read from `this.tune` on **every** render (PostFX.js:2321) and
`uRimStrength > 0.0` gates the whole composite branch (PostFX.js:1487), so `screenoff` is a true
OFF **by control flow**, not a small strength. No `src` edit is required for any arm.

**Shots: `night` · `sly-profile` · `hero`.** `night` is the critic's named worst case and the only
shot with no key on Sly. `sly-profile` and `hero` each carry a *pair* the critic named
(front-yes/back-no) plus a tail pair, so each supplies its own key-side reference.

**Staging — live-settle then freeze (§328/§330).** Per shot: `setShot(name, {})` with `dt`
**UNDEFINED** so the world clock settles live onto the roster's own value (the one changed call
that moved lithold's 0.678 back to the roster's 0.205); then freeze and render each arm with
`step(2, 0)` + `renderFrame(0)`.

**Warm-up: 2 discarded renders after staging, in every chunk, before `off` (§331).** `convprobe`
measured exactly one unconverged render after staging (1125 px / maxD 21 on `sly-key`, then six
bit-exact pairs); litbleach VOIDed on precisely that, and litbleach2 turned `R_sly-key` from
1120 px into **0 px** with this warm-up. The second render costs one frame per chunk and buys
margin against a shot that settles more slowly. **The bracket bar stays at 0.**

**Force-add every completed chunk's frames immediately** (§329.1) or the next rollback destroys
them — which is exactly how `shots/r13` was lost (§0).

### Chunking, bar by bar

Three boots, one shot each, 5 frames per boot. §141.1 requires the argument that chunking preserves
every bar, written before the capture:

| bar | compares | crosses a boot? |
|---|---|---|
| `R_<shot>` | `off` vs `back`, same shot | **no** — both frames are in that shot's own chunk |
| `CAL_<shot>` | `cal` against a constant | **no** — and chunking makes it *stronger*: each boot proves its own bypass instead of inheriting one |
| `CLIP_<shot>` | `raw`, that shot's own edge pixels | **no** |
| `PF_EDGE` / `PF_REPRO` | per-edge stats on that shot's `off` | **no** |
| `M1` `share_surf` / `share_screen` | `spike(off) − spike(screenoff)`, same shot | **no** |
| `M2` `Rlin` | shadow-edge vs key-edge linear spikes **within one shot**, then the per-shot ratios averaged | **no** — see below |
| `M3` `Sscreen` | `spike(off) − spike(screenoff)` per edge, then averaged | **no** — an average of within-boot statistics |
| `V_CHUNK_TREE` | one `src` hash at all three chunk times | by design |

**`M2` is computed per shot and only then averaged**, deliberately: a ratio taken across shots
would put a `night` numerator over a `hero` denominator and compare pixels from two different
boots. `night` carries **no** key-facing spike edge, so it contributes to `M3` and to the §9 LOOK
and **not** to `M2`; that is stated here so its absence cannot later look like a dropped row.
**No bar in this seal compares pixels across shots.**

---

## 5. PRE-FLIGHT — fail-closed, before any arm is adjudicated

| gate | bar | on failure |
|---|---|---|
| `PF_EDGE` | every registered edge locates `i0` **strictly inside** the ±6 window on `off`, and the **RGB distance** between its BODY and BG channel medians is **≥ 8.0** | that edge is **dropped and named**; if **> 3** of the 21 drop ⇒ **VOID** |
| `PF_REPRO_KEY` | ≥ **4 of the 5** registered SPIKE edges read `spike ≥ 20.0` on `off` | **VOID** — the runner is not staging the frame the defect lives in (§328) |
| `PF_REPRO_SHADOW` | **all 7** registered SHADOW edges read `spike < 20.0` on `off` | **VOID** — the defect is not present and there is nothing to attribute |
| `PF_NIGHT` | on `off`, every valid `night` edge reads `spike < 20.0` **and** `\|BODY − BG\| ≤ 8.0 L` | **VOID** — `night`'s content moved (§0) and it is no longer the worst case this seal was aimed at |

**`PF_EDGE`'s boundary test is an RGB distance, not a luminance difference, and the smoke run of
the scorer is why.** Written as `|BODY − BG| ≥ 2.0 L` it **rejected `sly-profile/torso-front`** —
the strongest key-side edge in the whole seal, spike **+30.0** — because Sly's blue costume and
the red wall behind him happen to sit **1.7 L** apart while being **167.2** apart in RGB. A
silhouette can be a pure *chroma* boundary at equal luminance, and that is exactly the case a rim
light exists to separate: a luminance-only validity gate throws away the seal's best evidence for
the reason the seal exists. **8.0** is half the smallest BODY↔BG RGB distance any of the 21 edges
shows on r12 (**16.0**, at `night/head-front`, where Sly is nearly invisible against his
background — the worst case in the set, and still 2× the bar). Caught, corrected and recorded
**before any frame existed**; §141.1 binds from here.

`PF_REPRO_KEY` also requires **at least 4 SPIKE edges to survive `PF_EDGE`**, not merely that 4 of
the survivors clear 20.0 L — otherwise dropping SPIKE edges would make the gate *easier* as the
data got worse, which is the shape of every gate that has ever passed a bad run in this repo.

`PF_REPRO_*` is the whole of §328's lesson: **prove the runner reproduces the defect before its
bars mean anything.** The bands are r12's own numbers with one edge of slack: 5 of 5 spike edges
clear 20.0 today (min 27.0) and 7 of 7 shadow edges are under it (max +1.3). `PF_NIGHT`'s 8.0 L is
2.3× the largest night `|BODY − BG|` I measured (3.5 L).

## 6. VALIDITY

| gate | bar | on failure |
|---|---|---|
| `V_ROWS` | 15 rows | **VOID** |
| `V_CHUNKS` / `V_CHUNK_TREE` | 3 chunks present; **one** `src` hash across all three | **VOID** |
| `R_<shot>` | `diff(off, back) == 0 px`, all three shots | **VOID** — achievable per §331; `linchroma` already hit 0 px with `raw`+`cal` arms between (§333) |
| `CAL_<shot>` | `cal` reads (64,128,191) ±1 over ≥ 5% of frame, all three shots | **VOID** — the bypass is not a bypass and nothing read through it means anything |
| `CLIP_<shot>` | < 5% of that shot's measured edge pixels at 255 in any channel in `raw` | **VOID** for `M2` on that shot — the HDR scene target in an 8-bit blit |

## 7. THE MEASUREMENTS AND THEIR SEALED BANDS

All three are computed **only** over the edges surviving `PF_EDGE`. `KEY5` = the 5 SPIKE edges
(`hero/cap-top`, `hero/chest-front`, `hero/tail-top`, `sly-profile/torso-front`,
`sly-profile/tail-top`), mean `spike(off)` on r12 = **28.27 L**. `SHADOW7` = the 7 valid
shadow-facing edges (#4, #6, #8, #11, #14, #16, #20).

### M1 — which path owns the key-side band? (display space)

`share_surf = mean over KEY5 of spike(screenoff)` · `share_screen = mean over KEY5 of
[spike(off) − spike(screenoff)]`.

| outcome | bar |
|---|---|
| **SURFACE-OWNED** | `share_surf ≥ 0.70 × mean spike(off)` |
| **SCREEN-OWNED** | `share_screen ≥ 0.70 × mean spike(off)` |
| **SHARED** | neither |

**Derivation of 0.70.** The only figure ever measured for Path B is 0.1/0.3/0.3 display units
(PostFX.js:101) ≈ **0.3 L**, i.e. ~1% of the 28.27 L key-side band. A 70/30 split therefore leaves
Path B a **28× margin** over its own prior measurement before the verdict flips — the band is
generous on purpose, so a SURFACE-OWNED result cannot be an artefact of a tight threshold.

### M2 — is the shadow-side rim PRESENT in LINEAR? (this is the §333 question)

Per shot: `Rlin(shot) = mean spikeLin over that shot's SHADOW edges / mean spikeLin over that
shot's KEY5 edges`, computed on the `raw` arm on `byte/255` (undecoded — `CAL` proves it, §333/
linchroma §2). `Rlin` = the mean of `Rlin(hero)` and `Rlin(sly-profile)`. `night` is excluded (§4).

| outcome | bar | route it selects |
|---|---|---|
| **DOWNSTREAM** | `Rlin ≥ 0.112` | Path A emits its full documented shadow-side band in linear and it does not reach the screen ⇒ **POSTFX / display space**, §333's route for a different quantity |
| **UPSTREAM** | `Rlin ≤ 0.056` | the band is emitted at ≤ half of the shader's own documented attenuation, i.e. gated off in linear ⇒ **SHADING**, at `toon.glsl.js:1031` / `:1190`, and §333 explicitly does not apply |
| **INCONCLUSIVE** | between | say so plainly; claim neither |

**Derivation. Both bands are in LINEAR and both come from the shader's own expression**, so
nothing here repeats §326's/§312's cross-space error. `0.112` is the integrated
shadow/lit ratio of lines 1029-1031/1190 over N·V ∈ [0, 0.40] at the shipped constants
(§2, `rim-offline.mjs`, 4000-sample quadrature). `0.056` is half of it — stated as half, not as
an independent quantity. The display-side figures (mean shadow spike +0.53 L, 1.9% of key) are
**not** used to set either band; they are what makes the question worth asking.

### M3 — does Path B carry the shadow side at all? (display space)

`Sscreen = mean over SHADOW7 of [spike(off) − spike(screenoff)]`, in display L.

| outcome | bar |
|---|---|
| **SCREEN-RIM-INERT** | `Sscreen ≤ 1.0` |
| **SCREEN-RIM-LIVE** | `Sscreen ≥ 3.0` |
| **INCONCLUSIVE** | between |

**Derivation.** Path B's own contract owes `uRimShadowFloor = 0.45 ×` its lit-side output on the
shadow side (PostFX.js:1505); against a 28.27 L key-side band that is **12.7 L**. `1.0` is 3.3×
its only prior measurement (0.3 L, PostFX.js:101), 1.9× the **entire** shadow-side spike budget
both paths currently deliver (mean +0.53 L), and still **12.7× short** of its own contract. `3.0`
is 5.7× that same +0.53 L, so anything above it is a contribution six times larger than
everything r12 has on the shadow side put together. **SCREEN-RIM-INERT falsifies
the sentence at `toon.glsl.js:1210-1212`** — that is a claim in `src` this seal can retire.

## 8. WHAT THIS SEAL DOES NOT DO

It proposes **no candidate, no dose, no `TUNE` change and no ship.** There is no acceptance bar on
a fix because there is no fix in it. Nothing in `src` moves on any outcome. Its only products are
three numbers and the route they select — and the point of sealing that route *before* looking is
that §333's lineage burned three seals choosing a lever first.

## 9. BINDING LOOK

Binding on the **route**, since nothing ships.

1. Open `night.off.png` and `night.screenoff.png`, at 1× and at 6× on Sly (he is ~25 × 80 px).
   **If a human cannot tell them apart, Path B does no separation work on the character at night**
   — and a `SCREEN-RIM-LIVE` verdict from M3 is **overruled to INCONCLUSIVE**, because a term that
   moves a number and not a frame has not been shown to be doing the job §2.1.5 asks for.
2. Open `hero.off.png` and `sly-profile.off.png`. Sly's **shadow-side** silhouette — back, right
   flank, tail — is scored against §7.3 *"No rim light separating silhouettes from the
   background"* by eye. **If it reads as separated, §1's table is measuring the wrong thing** and
   every M-row is a NO-CLAIM, whatever the numbers say.
3. Open `hero.raw.png`. It must show a recognisable scene. A black, constant or garbage frame is a
   `CLIP`/instrument failure and **VOIDs M2** regardless of what the ratio computes to.

A LOOK failure is a NO-CLAIM on the row it touches, regardless of the table.

## 10. REGISTERED FORECAST — falsifiable, before any frame exists

- **M1 = SURFACE-OWNED, ~85/15.** Path B's only measurement is 0.3 L and Path A carries
  `uRim 0.55 × uRimGain 4.10` into a linear buffer that then goes through a transform with ~100
  display-L-per-unit gain at these levels. The 15% is that §2's arithmetic shows Path B's ceiling
  (+74,+94,+58) sitting within ~10 bytes of the measured band, so it *could* be the whole thing.
- **M3 = SCREEN-RIM-INERT, ~80/20.** Predicted directly by §1(c): if Path B were live it would owe
  12.7 L on the shadow side and the measured shadow-side mean is 0.53 L.
- **M2 = UPSTREAM, ~60/40**, and this is the one I am least sure of and most want to be wrong
  about. For: §3's gain table says the transform *favours* the dark base by 3.1×, so 11.2% emitted
  in linear should have arrived as roughly a third of the key-side spike (≈ 10 L) and we measure
  a mean of 0.53 L — which implies far less than 11.2% is being emitted. Against: `sh` is not a clean 0/1,
  `slyTurn` and the AO/bloom terms I could not model all sit in between, and the same reasoning
  chain — inverting a display measurement through arithmetic to infer a linear quantity — is
  **exactly** what `NOTE-linear-vs-display.md` got wrong by 6× before §333 measured it directly.
  I am registering the number that reasoning gives and the reason it may be wrong.

**The single condition that would refute my reading of this whole file:** `M2 = DOWNSTREAM` with
`M3 = SCREEN-RIM-INERT`. That would mean the shader emits a proper shadow-side rim, the display
transform eats it, and Path B — the term written specifically to survive the transform — is doing
nothing about it. In that world §3's gain argument is wrong somewhere I cannot see from here, and
I will say so rather than reinterpret the bands.

## 11. DISPOSITION

- Any pre-flight or validity gate FAIL ⇒ **VOID**; nothing is claimed about either path.
- All gates PASS ⇒ record M1/M2/M3 against §7's bands and route the successor seal by them. The
  successor proposes the candidate; **this one does not**.
- **§141.1 absolute:** no band, threshold or edge coordinate in this file moves once a frame
  exists. A mis-aimed bar is recorded as mis-aimed, and a re-seal is a **NEW file**. In particular
  the **20.0 L** spike threshold, the **0.70** ownership split, the **0.112 / 0.056** linear band
  and the **1.0 / 3.0** screen-rim band are fixed now, in advance, on r12's numbers — and if the
  fresh `off` arm makes any of them look badly chosen, that is a finding to write down, not a
  threshold to move.

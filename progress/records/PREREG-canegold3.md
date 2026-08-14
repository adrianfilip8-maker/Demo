# PREREG — canegold3: the cane's gold read, as a DIELECTRIC hard-spec, with the fill dropped off the cream plateau

Sealed by CHARMAT before any arm existed and before any capture. Shape is owner-locked
(§294(2), "do not alter the shape") and nothing here touches geometry, scale, proportion, the
`.glb`, or its albedo file. **Material values only, poked live on one named material.**

Queued by RESULT-critic11 §2 and RESULT-critic12 §2/queue-4:

> "the cane hook never reads as gold in 16 frames" · "matte cream and small" ·
> "flat cream fill, no spec ping, no bloom, no occlusion"

---

## 1. Why the last attempt failed, and why this is a different cell of the matrix

§266/PREREG-charmat measured a **refusal**: `metal 0.85` + `gloss 96` made the cane's own
pixels *darker* (p99 −37.5 L at the asset's values, −41.0 L at Props gold's, against a
registered +10 L bar). The mechanism is in the shader and is not a tuning problem:

* `diff *= mix( 1.0, 0.20, slyMetal )` removes 80 % of the diffuse at `uMetal` 1.0 and 68 % at
  0.85, and the cane is **unmapped for metalness**, so nothing masks the kill down to a gild
  fraction;
* `specStep` is a shape function capped at **1.35** for every `glossP`, and `uSpecNormPow` is
  **0** (RESULT-specnorm2: `p ∈ (0.70, 0.90]` is a *conflict* interval, nothing shipped), so
  raising `uGloss` makes the highlight *smaller and no brighter*.

**Every arm canegold ever ran carried `metal > 0`** (assetgold 0.80, gold85 0.85, gold100 1.0,
gold85r64 0.85). The dielectric cell — `metal 0`, high `uSpec`, low `rough` — has never been
run. In that cell neither blocker applies: the diffuse kill is `mix(1,0.20,0) = 1.0` exactly,
and `specAmt = uSpec * (1 − 0.75·rgh)` is a **linear** lever that `specNormPow` does not gate.

Arithmetic, from `toon.glsl.js` as it ships:

```
              uSpec  rough   specAmt = uSpec*(1-0.75*rgh)   glossP = uGloss*(1-0.6*rgh)
  base         0.25   0.62   0.25*0.535 = 0.1338            32*0.628 = 20.1
  spec .90/.25 0.90   0.25   0.90*0.8125 = 0.7313  (x5.47)  32*0.85  = 27.2
```

`spec = specTint * (specAmt * specStep * 1.0 * sh * step(0.02,ndl) * 1.0)`, peak
`specStep = 1.35`, `specTint = uSpecColor = PAL.goldSpec 0xfffbe8` at `metal 0`. So the peak
additive term goes 0.181 → **0.987** of `uSpecColor` — an order of magnitude, with the diffuse
fully intact.

## 2. The second half, which the last attempt never had: THE FILL IS ALREADY WHITE

Measured on the r12 frames (§3). The cane's fill sits at **display L p50 214.6** with
**saturation p50 0.172** at hue 37.7°. There is 40 L of headroom below clipping. *A highlight
cannot read against a fill that is already at highlight brightness*, and an unsaturated
cream at L 214 is exactly what "flat cream fill" names.

Gold reads as gold by the **contrast between a saturated gold body and a white-hot ping**, not
by absolute brightness. So the candidate has two halves and the run measures them separately.

The tint is **not a chosen colour**. `_buildCane` already carries `0xe8b942` — it is this exact
material's own registered no-asset fallback (`{ color: 0xe8b942, vertexColors: true }`) and it
is `Props.js MATERIALS.gold.color`. Multiplying the asset's authored albedo by the material's
own gold is a `color` multiplier on the material; **the `.glb` and its albedo image are not
touched, on disk or in memory.**

```
  0xe8b942  ->  hue 43.0 deg   sat 0.7155   display L 186.4      (the anchor)
  r12 cane  ->  hue 37.7 deg   sat 0.172    display L 214.6      (the defect)
```

## 3. r12 BASELINES — measured before the seal, calibrate-then-accept DISCLOSED

Derived by `progress/records/charmat13/hookderive.mjs` on `shots/r12/*.png`, read-only, no
boot. The r12 crops are the centre half at 1:1 (`tools/critic.mjs`), so crop (cx,cy) maps to
frame (320+cx, 180+cy); the hook ROI was read off the crops and is stated in frame space:

```
  hook ROI  x[355,505] y[260,430]   151 x 171 = 25 821 px      (contains the whole crook and
                                                                the top of the shaft; no
                                                                character pixels)
  shot            full-ROI L                  count >= L
                  p50    p99   p999   max     200   210   220   230   240   250
  sly-closeup     92.2  237.7  243.8  244.0  1201  1095   650   478   105     0
  sly-key         85.4  237.7  243.8  244.8  1185  1076   636   480   105     0

  cream-cane proxy  (L >= 150 AND sat <= 0.35), inside the same ROI
  shot             n      L p50   L p99    hue p50    sat p50   sat p90
  sly-closeup    1 496    214.6   244.0     37.7 deg   0.172     0.329
  sly-key        1 518    213.6   243.8     37.7 deg   0.168     0.331
```

Three independent statements of the same defect: **zero pixels above L 244.8 anywhere in the
hook ROI on either shot**, and `canegold-run2.txt`'s procedural-cane base `max 239.4` on the
same shot agrees. The fill-to-peak separation is **29.4 L** (closeup) and **30.2 L** (key).

*(A third ROI was cut on `sly-profile` and is NOT used: its proxy came back at hue 184.9°,
i.e. the box caught the cyan wall behind the cane. Reported so the omission is not silent.)*

**Calibrate-then-accept is disclosed:** every threshold in §4 was fixed against the numbers
above, which were in hand before the seal. No threshold may move after a candidate frame
exists (§141.1); a mis-aim is NO-SHIP + recorded and a re-seal is a new file.

**§282 discipline.** The mask-size band in P3 is `[30 000, 55 000]` px on `sly-closeup`. The
55 000 ceiling was derived in RESULT-caneswap2 **for `sly-closeup`, on the swapped
`sly-cane.glb`** — the same shot and the same asset as this run, which is re-use *in its own
context*, and it is stated here so a reader can check that rather than take it on trust. It is
**not** registered for `sly-key`: no ceiling has ever been derived there, so `sly-key`'s mask
is REPORTED and gates nothing.

## 4. BARS — sealed. Gate shot is `sly-closeup`; `sly-key` carries one replication gate.

All bars are computed on the **cane mask** `M`: the pixels that the material named
`slydlrig:cane` paints, obtained by albedo-TAG differencing (recolour, not hide — hiding moves
the shadow map; `canegold.mjs` measured 66 941 px for a 1 356-tri cane that way).

| id | bar | on | calibration |
|----|-----|----|-------------|
| **G1a** | `count( L >= 248 ) >= 200 px` on `M` | sly-closeup | base state measures **0 px >= 250** in the hook ROI on two independent r12 frames, max 244.0/244.8, and canegold run 2's base max was 239.4. 248 is above all three and below clipping. **200 px** is `PREREG-specnorm2`'s own registered visibility unit — its H1 was ">230 on >= 0.02 % of frame"; 0.02 % of 1280x720 = 184 px, rounded up. Quoted, not invented. |
| **G1b** | `p999(M) - p50(M) >= 60 L` | sly-closeup | the defective separation is **29.4** and **30.2 L**, measured twice on independent frames. The bar is 2x the measured defect. |
| **G2** | `sat p50(M) >= 0.44` **AND** `hue p50(M) in [30,55] deg` | sly-closeup | base sat 0.172 / 0.168 (twice); anchor `0xe8b942` sat 0.7155. Bar = midpoint (0.172+0.7155)/2 = 0.4438. The hue band contains BOTH base (37.7) and anchor (43.0), so G2 **cannot be passed by rotating hue** — it is a pure saturation claim under a hue HOLD. |
| **G3** | `L p50(M) in [140, 200]` | sly-closeup | base 214.6 / 213.6 — above the band, which is the plateau the fix must leave. Ceiling **200** is `toon.glsl.js`'s own quoted environment cap ("the sandstone palette caps that at display L 197"), so the fill sits at or under what the world's lit stone reaches and the ping has somewhere to go. Floor **140** = 0.75 x the anchor's 186.4: below three quarters of its own albedo luma a gold fill is gold *in shadow*, not lit gold. |
| **G4** | `halo >= 300 px` **AND** `haloNearPing / halo >= 0.50` | sly-closeup | `halo` = differing px outside `M` but inside `M`'s 16-px-dilated box (`canegold.mjs`'s existing decomposition). canegold run 2 measured halo **1074 / 1076 px** for arms that only *darkened* the cane, so ~1000 px is what a whole-cane luminance change produces; 300 is a third of it. The discriminating half is the ratio: `haloNearPing` = halo px within **12 px Chebyshev** of a candidate px with `L >= 248`. A uniform brightening spreads its halo along the whole cane and fails the ratio; a ping concentrates it. **The 12 px is a calibrate-then-accept choice** (no bloom-radius constant is published in `PostFX.js` in screen px at this resolution) and is disclosed as such. |
| **R1** | `count( L >= 248 ) >= 200 px` on `M` | **sly-key** | replication. The ping may not be a one-shot accident of one staging. Same threshold, same unit, no re-derivation. |

**Ship rule.** SHIP iff, on the winning arm: `G1a ∧ G1b ∧ G2 ∧ G3 ∧ G4` on `sly-closeup`,
`R1` on `sly-key`, **every** protection in §5 PASS, **and** the LOOK gate in §7 passes.
Anything else is DO-NOT-SHIP and is recorded as such. No partial ship, no bar substitution.

**Winner selection, written before the numbers exist:** if both `hardgold` and `hardgold2`
clear every bar, the shipped arm is the one with the **larger `haloNearPing/halo`**; on a tie
(within 0.02) the **lower `gloss`** wins, because §266's own argument predicts the tight lobe
buys nothing and the cheaper claim should be preferred.

## 5. ARMS and PROTECTIONS — one boot, live pokes, per-shot backs at [0,0] (§302)

Every arm is a live poke of `mat.userData.slyUniforms` (+ `mat.roughness`, + `mat.color`) on
**`slydlrig:cane` only**, followed by `setShot(shot, { dt: 0 })` (§251). No recompile, no
install, no src edit, **nothing on disk inside the lock** — §186's install-then-launch hazard
cannot arise because this run installs nothing.

```
  arm         color      spec  gloss  rough  metal     provenance of every value
  base        (live)     (live)(live) (live) (live)    READ OFF THE LIVE BUILD, never tabled
  fillonly    0xe8b942    -     -      -      -        the material's own fallback colour
  speconly      -       0.90    -    0.25     0        Props.js MATERIALS.gold.spec ; the
                                                        asset's own metalRough G = 0.250
  hardgold    0xe8b942  0.90   32    0.25     0        both halves, gloss unchanged
  hardgold2   0xe8b942  0.90   96    0.25     0        Props.js MATERIALS.gold.gloss
```

`fillonly` and `speconly` are **attribution arms and are required for the run to be
interpretable**: a tint is a multiply and can only move pixels *down*, so `fillonly` must NOT
clear G1a. **If `fillonly` clears G1a the instrument is measuring something other than a
specular lobe and the run is VOID** — declared here, before the numbers.

| id | protection | bar |
|----|-----------|-----|
| **P1** | §302 same-boot back validity. After **every** candidate arm the cane is restored from `BASE_STATE` and re-rendered. | **0 px** vs that shot's own `base` frame, per arm, per shot. Same boot only — no cross-boot [0,0] is registered anywhere in this seal. |
| **P2** | null: `base` vs `base2`, nothing poked between them | **0 px** |
| **P3** | positive control: the tag mask must fire | `\|M\| > 0`, and on `sly-closeup` `\|M\| in [30 000, 55 000]` (§3's disclosure). `sly-key` reported only. |
| **P4** | tag restore | `reshow` vs `base` = **0 px** |
| **P5** | non-cane materials untouched (Sly's costume) | `__readMat` on `slydlrig:body`, `:head`, `:tail`, `:eyeball` snapshotted before and after every arm — **exact** equality on spec/gloss/metal/sss/rim/rough/color. Any drift ⇒ VOID. |
| **P6** | environment byte-clean | `far` (differing px outside `M`'s 16-px-dilated box) = **0** for every candidate arm vs base, both shots. |
| **P7** | §294(2) shape untouched | the cane mesh's `geometry.attributes.position.version`, `geometry.attributes.position.count` and `matrixWorld.elements` read back before and after every arm — **identical**. A material poke that moved geometry is an instrument fault ⇒ VOID. |
| **P8** | §296 tree stamp — REPORTED, not gated | `find src -name '*.js' \| sort \| xargs sha256sum \| sha256sum` taken **inside the held lock** (§192.1 — a stamp at process construction samples the FIFO queue, not the boot) and again at the end. Both land in `result.json`. Five other lanes are queueing runs on this shared working tree and four `src/**` files carry their uncommitted mechanisms as this is sealed. **Deliberately not a gate:** every arm here is a runtime poke of one material inside one boot, so a foreign edit can only enter as a common-mode term across base and all four arms, which the same-boot differences remove. An unstamped move would be unfalsifiable; a stamped one is a fact on the record. |

Any protection FAIL ⇒ the run is VOID for candidate purposes and nothing ships, whatever the
G-bars read. Fail-closed: a bar that cannot be computed scores FAIL, never "skip".

## 6. SCORING RECIPE — exact commands

Bars are evaluated **inside the runner**, from the frames of the one boot, and printed. The
frames are also written so the LOOK gate and any re-score are possible without a re-boot.

```
  # 1. launch (detached; ABSOLUTE log and pidfile paths; the FIFO serialises against the
  #    other lanes and the runner waits in queue by itself)
  bash tools/launch.sh tools/canegold3.mjs \
       /home/user/Demo/progress/records/logs/canegold3-run1.log \
       /tmp/sands-of-ra/canegold3-run1.pid
  #    "launch OK ... ppid 1" is the ONLY success line.

  # 2. watch
  tail -n 80 /home/user/Demo/progress/records/logs/canegold3-run1.log

  # 3. the run writes, and the scoring reads, exactly:
  #      progress/records/canegold3/            frames (png) + result.json + manifest.json
  #      the scored table + the verdict line, at the end of the log

  # 4. re-score without a boot (idempotent, pure read):
  node tools/canegold3.mjs --score-only
```

`--score-only` re-runs §4 and §5 against `progress/records/canegold3/result.json` and must
reproduce the logged verdict character for character. A disagreement is an instrument fault
and voids the run.

### Outcome branches (all four written before the run)

1. **SHIP** — every bar and protection in §4/§5 green **and** §7's LOOK passes.
   Ship-write, exactly and only, in `src/player/SlyModelDLRig.js` `_buildCane`, the
   `shading.make({ name: 'slydlrig:cane', ... })` call:
   `color: 0xffffff` → `color: 0xe8b942` on the `asset.texture` branch, and the added
   `spec: 0.90, gloss: <winner>, rough: 0.25, metal: 0`. The §266 comment block above it is
   rewritten in the same commit to record that the refusal was about **metal** and that the
   dielectric cell passed — the refusal is corrected, not deleted. Plus a pin test in
   `tests/dlrig.test.mjs` asserting those five option values reach `shading.make`.
   Nothing else in the tree moves.
2. **DO-NOT-SHIP, mechanism measured** — any G-bar red with every protection green. Values
   stay as they ship, `RESULT-canegold3.md` records the per-arm numbers and the routing.
3. **VOID** — any protection red, or `fillonly` clearing G1a. No verdict is claimed, the
   numbers carry no evidential weight, and a re-run needs a **new** seal file.
4. **NO-SHIP by LOOK** — every number green and §7 fails. Recorded with the crops, and the
   numbers stand as a finding that the bars do not capture the read.

### Registered forecasts (§ forecast ledger)

| arm / bar | forecast | confidence |
|---|---|---|
| `speconly` G1a | PASS | high — the arithmetic in §1 is a x5.5 on a linear lever |
| `fillonly` G1a | **FAIL** (required; see §5) | very high — a multiply cannot create bright pixels |
| `hardgold` G1a, G1b | PASS | high |
| `hardgold` G2, G3 | PASS | high — the tint is a direct multiply onto a measured cream |
| `hardgold` G4 | PASS | **low** — `bloomThreshold` is 2.20 in *scene-linear*; whether a display-L-248 toon ping clears it is exactly what has never been measured here |
| `hardgold2` vs `hardgold` on G1a | `hardgold2` **lower** px count | medium — §266's own argument (tighter lobe, same 1.35 cap) predicts fewer pixels at the same peak |
| `R1` on sly-key | PASS | medium — same staging family, but a different key direction |

## 7. LOOK gate — BINDING

Crops are written by the runner at 2x and 4x on the hook, for `base` and every candidate arm,
to `progress/records/canegold3/`. The gate FAILS, and nothing ships regardless of §4, if any
of these is true of the winning arm:

* the ping reads as a **blown white blob** rather than a stepped toon highlight with a hard
  edge (this build inks and steps everything; a soft PBR-looking smear is off-model);
* the cane reads **brown or orange** rather than gold (the tint over-multiplied);
* the **outline ink is swallowed** — the hull line must still close the silhouette against the
  brighter fill;
* the hook's inner curve reads **lighter** than its outer curve (the critic's third ask was
  dark occlusion there; this run does not deliver occlusion, and it must not deliver its
  inverse).

Occlusion in the hook's inner curve is explicitly **NOT** in this seal — it needs an `aoMap`
or a baked albedo and both are texture work under §186. It is routed, not attempted.

## 8. What this seal does NOT claim

* Nothing about `uSpecNormPow`. The dielectric cell was chosen **because** it does not need it.
* Nothing about the world's gold, `gold_leaf`, `hieroglyph_gilded`, or `TUNE.bloomMetalGain`
  (which is 0 and stays 0 — raising it is a scene-wide change and would breach P6 by design).
* Nothing about the cane's SHAPE, scale, socket, grip solve, or the `.glb` bytes (§294(2)).
* Nothing about the head sculpt (§294(1), owner-waived) or the guard model (§309).

— CHARMAT, sealed 2026-08-14, before `tools/canegold3.mjs` was written.

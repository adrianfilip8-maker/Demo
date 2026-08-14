# PREREG-fxghost2 — the sandHigh ghost-disc FIX seal, take 2: the pool's AMBIENT leg and the sprite's own opacity (uAmbGain / uAlphaGain, one boot, poke arms)

**Lane:** POSTFX/FX artifact family (critic r11 family 3, "bloom/bokeh ghost discs floating in
temple (magenta) / sly-profile (120 px orange) / interior / night").
**Parents:** §135/§138 (mechanism and the three knobs it already refuted), §298.2 +
RESULT-critic10-postfx item 2 (attribution EVIDENCE-GRADE), PREREG-fxghost.md +
RESULT-fxartifact §1 + KNOWN_ISSUES §306 — the seal this one replaces, whose ROIs, amp
statistic, field-cost instrument, halo ROIs and GH bands are carried here VERBATIM.
**Date sealed:** 2026-08-14.
**Status: REGISTERED before any capture. `progress/records/fxfix1/` does not exist and no frame
of any arm has been rendered.** Runner `progress/records/fxfix/fxfix1.mjs` and scorer
`progress/records/fxfix/fxghost2-score.mjs` are committed with this file. The runner is SHARED
with PREREG-rimfloor2 (one boot, one lock window, per-shot poke arms); the two seals register,
score and ship INDEPENDENTLY — this file's verdict consumes only the rows named here.

**Seal provenance (recorded before any capture).** The seal's files — this document, its
sibling seal, the shared runner `progress/records/fxfix/fxfix1.mjs`, the two scorers, the
two INERT mechanisms and their pin tests — are commit **`273cca1`** on
`claude/sly-cooper-ancient-egypt-0koo0u`, pushed to origin at that sha. They first landed
in `6c269c1`, which a neighbouring lane then rewrote out of the branch (the tree and the
git index are shared with five other lanes); `6c269c1` is no longer an ancestor of HEAD
and `273cca1` is the sha to check. Either way the seal predates every frame of
`progress/records/fxfix1/`, which did not exist at either sha. Recorded because "sealed
before any capture" is a claim about a sha and has to be checkable as one — and because a
sha quoted from a commit that was later rewritten is exactly the kind of provenance that
looks checkable and is not.

## 1. Ownership and discipline

Torchlight3 §1 carried verbatim: bars sealed and PUSHED before any candidate frame; §141.1 (no
post-hoc threshold moves); fail-closed (VOID is not PASS); DETACHED launch via
`tools/launch.sh` with absolute log/pidfile paths; per-capture tree stamps (§296); same-boot
per-shot `off`/pokes/`back` with a strict `[0,0]` `back`-vs-`off` bar as the ONLY valid
pixel-identity form on this renderer (§302/§303). `ringPainter` untouched (D12 absolute).

**This run installs NOTHING.** Both levers are per-batch uniforms on a mechanism already in
HEAD, INERT and pin-tested (`tests/fxghost2.test.mjs`, landed with this file):
`fx.batches.get('sandHigh').material.uniforms.uAmbGain` and `.uAlphaGain`, both base 1.0 where
`x * 1.0` is IEEE-exact. So §186's install-under-lock machinery is not needed and no src byte
changes during the capture window. This seal's SHIP surface is ONE constant on ONE pool:
`src/fx/Emitters.js` `AMBIENT.sand_haze.ambGain` **or** `AMBIENT.sand_haze.gain` — written only
on PASS, only at a clear lock, per §8.

## 2. What the parent measured, and why these two levers

The attribution is evidence-grade and is NOT re-litigated: hiding `sandHigh` removes the discs
(three replications across boots and trees, §135/§298.2). The sprite's colour model
(`Particles.js` PARTICLE_VERT, LIT) is

```
col = mix( aCol0, aCol1, u ) * mix( uAmbTint, uLightTint * boost, uLitMix )    (sand_haze litMix 0.52)
```

PREREG-fxghost swept the KEY leg (`uLitMix` → 0.26 / 0.13 / 0.00) and was **falsified on a
fully valid run** (RESULT-fxartifact §1; V1/V2/BG green, R `[0,0]` ×7):

| arm | G1 temple | G2 night | G3 night | G4 night | G5 night |
|---|---|---|---|---|---|
| off (amp) | 15.92 L | 9.49 L | 8.18 L | 6.22 L | 4.62 L |
| a26 | 11.46 (r 0.72) | 9.20 (r 0.97) | 7.94 (0.97) | 6.06 (0.97) | 4.48 (0.97) |
| a13 | 8.84 (r 0.56) | 9.04 (r 0.95) | 7.80 (0.95) | 5.96 (0.96) | 4.41 (0.95) |
| a00 | 5.75 (r 0.36) | 8.90 (r 0.94) | 7.68 (0.94) | 5.91 (0.95) | 4.34 (0.94) |

**Deleting the key leg entirely leaves the four night discs at r ≥ 0.94.** So the discs'
brightness is carried by the OTHER leg — `uAmbTint` — and by the sprite's own opacity, which
is what `uLitMix` cannot touch. §306 routes the follow-up to exactly those two, and this seal
sweeps both in one boot so the run cannot end without saying which one owns the disc.

**The two arm families, and the arithmetic that sizes them.**

*Ambient family (`uAmbGain` = g, a RECOLOR):* `col *= mix( uAmbTint * g, uLightTint * boost,
uLitMix )`. From the parent's own three doses, solving the linear model
`amp(m) = (1−m)·X + m·Y − D` on G2 gives `Y − X = 1.15 L` and `amp(g) = 9.498 − 0.48·X·(1−g)`
— i.e. the ambient leg can remove at most `0.48·X` of the disc, where `X` is the ambient-lit
sprite's own ROI-diluted luma. It reaches r ≤ 0.35 on G2 only if `X ≥ 12.9 L`. That is the
honest unknown this family is here to measure, and it is why the family cannot be the seal's
only candidate. Arms **{0.25, 0.00}**.

*Opacity family (`uAlphaGain` = g, a THINNING):* `alpha *= g`, and for an alpha-blended sprite
`out − dst = a·(col − dst)`, so the residual scales **linearly in g** — exactly, in scene
space, and to first order through AgX + the sRGB encode at these delta sizes. r ≈ g, so
`g = 0.30` sits exactly on GH_G1's 0.30 bar and `g = 0.18` clears every GH band with margin.
Arms **{0.30, 0.18}**. This family cannot fail on efficacy; it can only fail on COST, which is
the whole reason it is bounded and gated below rather than shipped on sight.

**Disclosed deviation, stated before any frame exists (this is PF4).** §138.4 registered
*"a fix that removes the disc by thinning the field is a FAIL, not a partial success"*, with
PREREG-sandhigh Arm B holding exterior contribution to ±15%. That clause was written when
`sandHigh` was believed to carry a visible haze. Three measurements since say the cost it
protects is small and separable: (i) the pool's own source note — `sand_haze` is 16× thinner
than `sand_drift` and *"a veil at one sprite per 500 m³ is not a veil"*; (ii) `sandHigh`
carries `sand_haze` **and nothing else** (asserted in `tests/fxghost2.test.mjs`), while
`sand_drift` — *"the only ambient field that has ever shown up in a frame"* — is on `sandLow`
and is untouched by a per-batch uniform, by construction; (iii) the parent's own field
instrument sized the whole pool at Σ|ΔL| 20,634 over 5,930 px on `dunes` (0.64% of the frame
at mean 3.5 L), 20,852 / 5,116 on `hero`, 16,656 / 4,773 on `courtyard`. So:

- the **ambient** arms are recolors and take PREREG-fxghost §4's recolor band **F ∈ [0.40,
  1.60]** unchanged;
- the **opacity** arms take a DISCLOSED band **F ∈ [0.15, 1.60]** with the footprint ratio
  reported, and the exterior LOOK gate BINDING;
- and if the coordinator holds thinning to §138.4/Arm B's ±15%, **the opacity arms cannot ship
  and the seal defers to that reading** (PF4). The frames and the table stand either way.

## 3. Arms, ROIs and instruments

Shots consumed by this seal (staged once each, `{dt:0}`, torchlight3 staging = the staging the
parent's amps were measured at): `temple`, `night`, `interior`, `dunes`, `hero`, `courtyard`,
`sly-profile`.

Arms, in order, each RESTORE-FIRST from the all-base state, captured after `step(2,0)` +
`renderFrame(0)`, with §40 readbacks and a per-capture tree stamp:

`off` (all base) → `ahide` (sandHigh mesh hidden — the pool-free reference) →
`g25` (uAmbGain 0.25) → `g00` (uAmbGain 0.0) → `t30` (uAlphaGain 0.30) → `t18` (uAlphaGain 0.18)
→ [PREREG-rimfloor2's arms on shots they share] → `back` (all base).

`sly-profile` carries only `ahide`, `g00`, `t18` (the maximum-effect arm of each family): the
parent found no ≥150 px component there at `{dt:0}` staging, so it has no gating ghost bar and
is captured for the LOOK gate and a REPORTED component census. `diff(off, back)` brackets
every intervening poke of the shot.

### Registered ghost ROIs [x0,y0,x1,y1] — PREREG-fxghost §3, verbatim

- **G1** temple [602,138,656,194] — the star-ceiling disc, the 3×-replicated anchor
- **G2** night [152,23,198,69] · **G3** night [753,342,787,383] ·
  **G4** night [954,43,988,71] · **G5** night [465,154,497,193]

Statistic: **amp(arm, G) = meanL(arm) − meanL(ahide)** over G — the residual the pool leaves
over the pool-free picture, same-boot. Ratio r = amp(arm)/amp(off).

Field-cost instrument (exteriors {dunes, hero, courtyard}): **C(arm) = Σ|ΔL| over px with
|L(arm) − L(ahide)| ≥ 2**, whole frame; ratio C(arm)/C(off), with n(arm)/n(off) REPORTED.

### Protection ROIs (the four named in the routing, each with a bar)

- night **LAMPS** [660,0,779,59] · **MOON** [380,50,439,109] — "night lantern sparkles"
- interior **TORCH-A** [1004,175,1031,218] · **TORCH-B** [280,190,307,227] — "torch halos"
  (PREREG-critic10-postfx B4's ROIs, carried verbatim; all four measured 0.000 at every arm of
  the parent run, which is the by-construction prediction a per-batch uniform makes)
- courtyard **OBELISK** [580,0,650,150] coolGlint(120,10) — "obelisk tip", the intended
  silhouette rim + tip sparkle, 7055 px at off in the parent boot
- "the INTENDED sand sparkle elsewhere" is `air_motes` (additive + LIT, batch `airMotes`),
  `sand_drift` (batch `sandLow`), `spark` and `SparkleField`: all on different batches, so a
  `sandHigh` uniform cannot reach them BY CONSTRUCTION — pinned by the readback (V2 asserts the
  other batches' gains are still 1.0) and by `tests/fxghost2.test.mjs`, and looked at in §5.

## 4. Registered bars (scored by `fxghost2-score.mjs`; VOID is not PASS)

| id | quantity | band |
|---|---|---|
| V1 | one src content hash across all rows this seal consumes | else VOID |
| V2 | §40 readbacks: consumed arm's levers at commanded values, every other batch's gains 1.0, sandLive ≥ 1 | else VOID |
| V3 | `postfx.ok === true` and zero page console errors at every consumed row | else VOID |
| R_&lt;shot&gt; ×7 | `diff(off, back)` strict px | **[0,0]** each; nonzero VOIDs that shot's rows |
| BG_G1 | amp(off, G1) | **≥ +8 L** else the temple block is VOID |
| BG_G2 | amp(off, G2) | **≥ +5 L** else the night block is VOID |
| GH_G1 | r ≤ **0.30** ∧ amp ≤ **6.0 L** | both |
| GH_G2 | r ≤ **0.35** ∧ amp ≤ **5.0 L** | both |
| GH_G3 / GH_G4 / GH_G5 | r ≤ **0.55** each | all |
| F_dunes / F_hero / F_courtyard | C(arm)/C(off) | **[0.40, 1.60]** (ambient arms) · **[0.15, 1.60]** (opacity arms, §2's disclosed deviation) |
| HALO ×4 | \|Δ meanL\| vs off on LAMPS / MOON / TORCH-A / TORCH-B | **≤ 1.0 L** per ROI |
| P_obelisk | coolGlint retention ≥ **0.85** ∧ \|Δ meanL\| ≤ **1.5** | both |
| LOOK | §5 | **BINDING**, adjudicated in the RESULT off the scorer's crops |

Every GH, HALO and F band above is PREREG-fxghost §4's at its sealed value; `P_obelisk` and
`V3` are new; the opacity arms' F band is the disclosed deviation of §2 and nothing else has
moved.

**Ship rule (registered):** the FIRST arm in this order whose bars ALL pass, and whose crops
pass the LOOK gate, ships:

1. `g25` — `AMBIENT.sand_haze.ambGain = 0.25`
2. `g00` — `AMBIENT.sand_haze.ambGain = 0.0`
3. `t30` — `AMBIENT.sand_haze.gain = 0.30`
4. `t18` — `AMBIENT.sand_haze.gain = 0.18`

Recolor before thinning (the class §138.4 prefers, and the smaller intervention), and within
each family the LARGEST surviving gain first — PREREG-kerb's registered-rule form. No arm
qualifying → no ship (§6).

## 5. §17 look declaration and the LOOK gate

Intended change: over DARK backdrops — the temple star ceiling, the night sky, shadowed
interior air — the `sand_haze` sprites stop reading as discrete warm discs. The ambient arms
do it by taking the ambient leg's tint off the sprite (a recolor: the population and every
sprite's geometry are unchanged); the opacity arms do it by making the veil thinner, which is
visible as a thinner veil and is the cost §138.4 names. NOT intended: any change to another
pool, to the lantern sparkles, the torch halos, the obelisk tip, or to `sand_drift`'s ground
haze.

LOOK gate (all BINDING, adjudicated in the RESULT off the scorer's crops):
1. **temple G1 at 4×** — the mauve disc no longer reads as a disc over the star ceiling;
2. **night G2 and G3 at 4×** — the mauve circles no longer read;
3. **dunes and hero at 1× and 2×** — the haze field is still present and reads as airborne
   sand, not as smoke, dirt, or nothing at all (§138.4's anti-thinning clause's look half —
   this is the gate the opacity arms have to survive);
4. **courtyard at 2× over the obelisk** — tip sparkle and silhouette unchanged;
5. **interior at 1× and sly-profile at 1×** — no NEW disc artifacts introduced, torch halos
   unchanged.

## 6. Falsifiers and outcome branches — revert, do not defend

1. **PF1 (ambient leg insufficient):** both `g` arms fail a GH bar on valid captures ⇒ `X` is
   below the 12.9 L the §2 model needs, the ambient leg does not own the disc either, and the
   recolor route is CLOSED. Record the solved decomposition; the rule steps to the opacity
   family.
2. **PF2 (everything insufficient):** all four arms fail a GH bar ⇒ **NO SHIP**. With the key
   leg (parent), the ambient leg and the sprite's opacity all falsified, no property of the
   sprite reaches the disc, which is §138.3's conclusion promoted to a measurement over the
   complete colour model — and the item routes to the enclosure/zone gate (§138.5's declined
   candidate, `Lighting._updateEnclosure`, a cross-module ask) with this table as its evidence.
3. **PF3 (cost):** GH bars pass but an F bar or `P_obelisk` or a HALO bar fails ⇒ that arm
   dies; the rule steps to the next arm; all dying ⇒ no ship, with the cost quantified.
4. **PF4 (Arm-B reading):** the coordinator holds thinning candidates to §138.4 / PREREG-
   sandhigh Arm B's ±15% ⇒ the opacity arms cannot ship and the seal defers to that
   adjudication. Stated now, before any frame exists.
5. **PF5 (validity):** V1/V2/V3/BG out, or any `R_<shot>` ≠ 0 ⇒ affected blocks VOID,
   fail-closed; archive `mv progress/records/fxfix1 progress/records/fxfix1-void-runN`,
   diagnose, relaunch. No resume (PF7 in the runner).
6. **PF6 (LOOK):** mechanical PASS but the exterior crops show the veil gone or turned to
   smoke ⇒ the binding LOOK gate kills the arm. Do not retune toward the band (§141.1).

## 7. Registered forecast (ledger per §303)

**`t18` ships (~30%); `t30` ships (~15%); `g25`/`g00` ship (~10%); no ship ~45%.**

Grounds: the opacity family's efficacy is arithmetic (r ≈ g), so `t18` clears every GH band
unless the amp statistic is badly non-linear through AgX; its exposure is entirely in F and in
LOOK item 3, and the disclosed F floor of 0.15 is set below the ~0.18 the linear model
predicts precisely so the bar tests the LOOK question rather than pre-deciding it. The ambient
family is a genuine coin flip on an unmeasured quantity (`X`), and its own failure mode is
benign — it is a recolor, so PF1 costs nothing and buys the decomposition.

Honest uncertainties: (i) at `g00` the sprite becomes 52% of a pure key-lit colour, which over
DAYLIT sand may read as a DARK veil and blow F upward rather than downward — the parent
already saw this direction (`a00` took courtyard to ×1.54), so `F_courtyard` is the ambient
family's most likely fail; (ii) `t30` at r ≈ 0.30 sits exactly on GH_G1's bar and will be
decided by the AgX non-linearity in whichever direction it goes; (iii) the night block VOIDs
if G2 does not stage (low — the boxes reproduced across three boots, and the parent measured
9.49 L at this exact staging).

## 8. SCORING RECIPE (exact commands; every outcome branch)

The runner is DETACHED. Do not wait interactively; the FIFO may hold it behind five other
lanes' runs.

1. **Is it done?** `tail -5 /home/user/Demo/progress/records/logs/fxfix1-run1.log` — done =
   the last lines are `DONE. Score with:` + the two scorer paths. `ABORT`/`PF` lines: the log
   says which guard fired. Liveness: `pgrep -f 'fxfix[1]\.mjs'` (bracket pattern) or check
   `/tmp/sands-of-ra/fxfix1.pid` against `/proc`.
2. **Score:** `cd /home/user/Demo && node progress/records/fxfix/fxghost2-score.mjs`
   (exit 0 = some arm passed mechanically; exit 1 = no arm passed). Then LOOK at
   `progress/records/fxfix1/crops/fxghost2-*` — §5 is BINDING and no verdict line is a ship
   decision without it.
3. **PASS (mechanical + LOOK) → ship-write.** §296 first: confirm
   `/tmp/sands-of-ra/capture.lock` is absent AND `/tmp/sands-of-ra/queue/` is empty
   IMMEDIATELY before touching src, and `git status` shows no other lane mid-edit in
   `src/fx/Emitters.js`. Then ONE commit citing `RESULT-fxghost2.md`, staging ONLY these paths:
   - `src/fx/Emitters.js`: add ONE key to the `sand_haze` def — `ambGain: <v>` (ambient arm)
     or `gain: <v>` (opacity arm) — and extend the pool's comment with: "&lt;key&gt; &lt;v&gt;
     per RESULT-fxghost2.md (PREREG-fxghost2 one-boot sweep): the pool's &lt;ambient leg /
     opacity&gt; owned the §135/§298 ghost discs that `litMix` could not reach (temple G1
     15.92 → &lt;amp&gt; L, night G2 9.49 → &lt;amp&gt; L); the exterior field's read is held by
     the F bars + the binding LOOK gate."
   - `tests/fxghost2.test.mjs`: flip the inert assertion for that ONE key to the shipped value
     (keep every other assertion — the spelling pins, the `litMix` pins, and the
     one-pool-on-sandHigh assertion — exactly as they are).
   - `node --test "tests/*.test.mjs"` — all green before push.
   - Write `RESULT-fxghost2.md` + a KNOWN_ISSUES § in the same push.
4. **PF1/PF2/PF3/PF4/PF6 (no ship):** NO src write. `RESULT-fxghost2.md` + KNOWN_ISSUES §
   carrying the per-arm amp/ratio table, the solved `X`/`Y` decomposition, the field-cost
   curve, and the routing (§138.5's enclosure gate for PF2).
5. **PF5 (VOID):** archive `mv progress/records/fxfix1 progress/records/fxfix1-void-run1`,
   diagnose, relaunch with
   `bash tools/launch.sh progress/records/fxfix/fxfix1.mjs /home/user/Demo/progress/records/logs/fxfix1-run2.log /tmp/sands-of-ra/fxfix1.pid`.

# PREREG-rimfloor2 — the seam-glint FIX seal, take 2: cut the SCREEN-rim shadow floor OFF-SUBJECT (TUNE.rimFloorOffCut, one boot, poke arms)

**Lane:** POSTFX/FX artifact family (critic r11 family 3: "edge-detect christmas-lights on
block seams (dunes/night/guard)"). **Parent:** PREREG-seamglint.md + RESULT-fxartifact §3 +
KNOWN_ISSUES §306 — the seal this one replaces, whose ROIs, predicates, E bands and P bands
are carried here BY CITATION and VERBATIM. Grandparent: PREREG-kerb.md (the sweep form and
the "count is secondary, the frozen-set mean drop is primary" lesson).
**Date sealed:** 2026-08-14.
**Status: REGISTERED before any capture. `progress/records/fxfix1/` does not exist and no frame
of any arm has been rendered.** Runner `progress/records/fxfix/fxfix1.mjs` and scorer
`progress/records/fxfix/rimfloor2-score.mjs` are committed with this file. The runner is
SHARED with PREREG-fxghost2 (one boot, one lock window, per-shot poke arms); the two seals
register, score and ship INDEPENDENTLY — this file's verdict consumes only the rows named here.

**Seal provenance (recorded after the fact, before any capture).** The seal's files —
this document, its sibling seal, the shared runner `progress/records/fxfix/fxfix1.mjs`,
the two scorers, the two INERT mechanisms and their pin tests — landed in commit
`6c269c1` on `claude/sly-cooper-ancient-egypt-0koo0u` and were pushed at `f6dea0d`. The
tree is shared with five other lanes and that commit carries another lane's message
because it swept a shared index; the CONTENT of this seal is complete in it and predates
every frame of `progress/records/fxfix1/`, which did not exist at that sha. Recorded here
rather than silently, because "sealed before any capture" is a claim about a sha and has
to be checkable as one.

## 1. Ownership and discipline

Torchlight3 §1 carried verbatim: bars sealed and PUSHED before any candidate frame; no
post-hoc threshold moves (§141.1); fail-closed (VOID is not PASS); the runner launches
DETACHED via `tools/launch.sh` with absolute log and pidfile paths; same-boot per-shot
`off`/pokes/`back` with a strict `[0,0]` `back`-vs-`off` bar is the ONLY valid pixel-identity
form on this renderer (§302/§303 — a cross-boot `[0,0]` bar is unachievable here and voids the
run); per-capture tree stamps (§296); `ringPainter` untouched (D12 absolute).

**This run installs NOTHING.** Both levers are live uniforms on a mechanism that is already in
HEAD, INERT, and pin-tested (`tests/rimfloor2.test.mjs`, landed with this file):
`postfx.tune.rimFloorOffCut` (re-read per frame) and `shading.uniforms.uRimShadowFloorArch`
(sticky). So §186's install-under-lock machinery is not needed and no src byte changes during
the capture window. This seal's SHIP surface is at most TWO constants —
`src/render/PostFX.js` `TUNE.rimFloorOffCut` and, only for the combined arms,
`src/render/ToonMaterial.js` `TUNE.rimShadowFloorArch` — written only on PASS, only at a clear
lock, per §8.

## 2. Why THIS candidate: the parent measured where the glints live

r11 names blue edge glints peppering block seams on dunes/night/guard regardless of light
direction. PREREG-seamglint's candidate — the ARCHITECTURE surface-rim shadow floor
(`rimShadowFloorArch` 0.55 → 0.20/0.10) — was run and **failed on efficacy, not on cost**
(RESULT-fxartifact §3, all validity green, R `[0,0]` ×6):

| arm | dunes r | night r | guard r | kerb drop / remain | obelisk | chest | lamps/moon | night budget |
|---|---|---|---|---|---|---|---|---|
| c20 (arch 0.20) | 0.44 | 0.74 | 0.90 | 36.9 L / 0.32 | r1.00 d0.00 | 0 px | 0.32 / 0.02 | 7.5% |
| c10 (arch 0.10) | 0.42 | 0.49 | 0.87 | 57.3 L / 0.19 | r1.00 d0.00 | 0 px | 0.42 / 0.03 | 8.3% |
| **s10** (SCREEN floor 0.10, arch at base) | **0.77** | **0.90** | — | — | — | — | — | — |

Every P (protection) bar passed at both arch arms; E_dunes (≤0.35), E_night (≤0.45) and
E_guard (≤0.45) all missed. The decomposition the s10 arm bought: taking the arch floor to
0.10 leaves 0.42 of the dunes population, and the SCREEN-rim floor removes 0.23 of the total
on its own — **so the screen-rim term owns ~55% of the residual the arch floor cannot reach**
(0.23 / 0.42), and ~20% of night's. PREREG-seamglint §6.1's routing note fired on exactly this
reading, and §306 records it.

**Why the screen floor cannot simply be lowered, and what this seal does instead.** The
population `rimShadowFloor` = 0.45 holds up includes the CHARACTER's shadow-side silhouette
rim — §2.1.5's "single biggest AAA tell", and the reason PREREG-seamglint declared the screen
floor NOT a ship candidate ("its population includes the CHARACTER's screen rim, which this
run's protection set cannot bound"). So the candidate cuts the floor **off-subject only**,
scoped by ledger #31's prepass subject mask exactly as ToonMaterial scopes its surface twin by
`vSlySkin`:

```
float rimFloor = uRimShadowFloor;
if ( uRimFloorOffCut > 0.0 ) { ...4-tap dilated subj...
  rimFloor = max( uRimShadowFloor - uRimFloorOffCut * ( 1.0 - clamp( subj, 0.0, 1.0 ) ), 0.0 ); }
float amt = edge.g * uRimStrength * mix( rimFloor, 1.0, edge.b );
```

Three properties this rests on, each checked rather than asserted: (i) at 0 the branch is not
entered, so the shipped image is byte-for-byte the shipped image — INERT, not
approximately-inert; (ii) the mask is DILATED by a one-texel cross because the rim band
straddles the silhouette and is drawn partly on background pixels, so an undilated tap would
shave the outer half of the character's own rim — `max()` means every way of being near the
subject keeps the FULL floor, which is the fail-toward-shipped direction; (iii) the prepass
writes alpha inverted (1 = not the subject) and clears to 1, so every way of failing to write
the tag — sky, FX, transparent, never-written — lands on "not the subject" and can only cost
architecture rim, never character rim.

**The combined arms exist because the decomposition says one term is not enough.** The arch
floor alone missed; the screen floor alone removes 23%/10%. The registered ship rule tries the
screen-only arms FIRST (one constant, smallest intervention) and falls to the combined arms
only if screen-only cannot clear the parent's own E bands — which are carried here unmoved.

## 3. Arms, ROIs and instruments

Shots consumed by this seal (staged once each, `{dt:0}`, torchlight3 staging — the SAME
staging PREREG-seamglint calibrated on, which is why its off-frame populations are quotable
below): `dunes`, `night`, `guard`, `hero`, `courtyard`, `sly-closeup`, `sly-profile`.

Arms, in order, each applied RESTORE-FIRST from the all-base state, each captured after
`step(2,0)` + `renderFrame(0)`, each with §40 readbacks and a per-capture tree stamp:

`off` (all base: rimFloorOffCut 0, rimShadowFloor 0.45, rimShadowFloorArch 0.55) →
[PREREG-fxghost2's arms on shots they share] →
`k10` (arch floor 0.10 — the in-boot reproduction of the parent's c10, report-only) →
`rimz` (rimShadowFloor 0.0 — the screen-rim-floor-free reference, report-only, and the arm
that FREEZES this seal's character population) →
`w35` (rimFloorOffCut 0.35 = off-subject floor 0.10) → `w45` (0.45 = off-subject floor 0.00) →
`b35` (arch 0.10 **and** offCut 0.35) → `b45` (arch 0.10 **and** offCut 0.45) → `back` (all base).

`diff(off, back)` brackets EVERY intervening poke of the shot (torchlight3 §6's property).

### Predicates (one implementation, `fxfix-lib.mjs`, shared with the scorer)

Carried verbatim from PREREG-seamglint §3:
- `coolGlint(lMin, brMin)`: `B > R ∧ B−R ≥ brMin ∧ L ≥ lMin ∧ B ≥ G−4`;
- `speck(lift 14)`: `L ≥ median(11×11 subsampled neighbourhood) + 14 ∧ B ≥ R`.

### ROIs [x0,y0,x1,y1] with the parent boot's off-frame populations (quoted so the BG floors are honest)

- **DUNES** [700,150,900,330] coolGlint(95,12) — 327 px
- **NIGHT-L** [90,180,250,520] speck — 1954 px · **NIGHT-R** [1000,240,1180,420] speck — 1994 px
- **GUARD** [700,150,1100,450] speck — 2990 px
- **KERB** hero [820,500,1100,610] coolGlint(120,14) — 2597 px
- **OBELISK** courtyard [580,0,650,150] coolGlint(120,10) — 7055 px (protection: the intended
  silhouette rim + tip sparkle)
- **CHEST** sly-closeup [615,275,665,325] (protection, character interior)
- **LAMPS** night [660,0,779,59] · **MOON** night [380,50,439,109] (protection)

### NEW — the character-protection instrument this seal exists to carry

The screen rim's own population is isolated the way `ahide` isolates a particle pool: from
this boot's own reference arm. For a box `B` and a shot `s`,

> **RIMSET(s, B) = { px ∈ B : L(off) − L(rimz) ≥ 3 }** — every pixel the screen-rim shadow
> floor lifts, frozen from this boot, at this staging.

Boxes (chosen from the committed `fxartifact1` off frames, before any arm of this run exists):

- **SLY-CU** sly-closeup [575,112,712,375] — Sly's cap/head/torso/gloves **including his
  silhouette**, which is where the rim is drawn
- **SLY-PR** sly-profile [598,112,712,352] — the same on the profile shot
- **WALL-CU** sly-closeup [180,150,430,420] · **WALL-PR** sly-profile [120,120,380,330] —
  plain architecture in the SAME frame: the discrimination control

Statistics per arm, per box: `drop(arm, S) = mean( L(off) − L(arm) )` over the frozen set `S`,
and `hit(arm, S) = |{p ∈ S : L(off) − L(arm) ≥ 2}| / |S|`.

The character boxes contain some wall (they must — the rim lives on the silhouette, and the
silhouette is where Sly meets the wall). That contamination is why the WALL boxes are a
registered VALIDITY arm rather than a footnote: if the candidate does not visibly move the
wall's own rim set, the character bar is measuring nothing and VOIDs instead of passing.

## 4. Registered bars (scored by `rimfloor2-score.mjs`; VOID is not PASS)

| id | quantity | band |
|---|---|---|
| V1 | one src content hash across all rows this seal consumes | else VOID |
| V2 | §40 readbacks: every consumed arm's levers at commanded values, others at base | else VOID |
| V3 | `postfx.ok === true` and zero page console errors at every consumed row | else VOID |
| R_&lt;shot&gt; ×7 | `diff(off, back)` strict px | **[0,0]** each; nonzero VOIDs that shot's rows |
| BG | off populations: dunes ≥ **150**, night-L ≥ **800**, night-R ≥ **800**, guard ≥ **1000**, kerb ≥ **1200** | else VOID (population absent) |
| BG_char ×2 | \|RIMSET(SLY-CU)\|, \|RIMSET(SLY-PR)\| | ≥ **200 px** each else the character block VOIDs |
| BG_disc ×2 | `drop(arm, RIMSET(WALL-CU))`, `drop(arm, RIMSET(WALL-PR))` at the arm under test | ≥ **3.0 L** each else the character block VOIDs (instrument blind) |
| E_dunes | remaining/off | **≤ 0.35** |
| E_night | (L+R remaining)/(L+R off) | **≤ 0.45** |
| E_guard | remaining/off | **≤ 0.45** |
| E_kerb | mean L drop over the off-frozen kerb set ≥ **25** ∧ remaining ≤ **0.35** | both |
| P_obelisk | retention ≥ **0.85** ∧ \|Δ meanL\| ≤ **1.5** | both |
| P_chest | changed px (\|ΔL\| ≥ 2) | **≤ 40** (FXAA allowance) |
| P_lamps | LAMPS ∧ MOON \|Δ meanL\| | **≤ 1.0** each |
| P_nightbudget | night whole-frame changed (\|ΔL\| ≥ 2) | **≤ 12%** of frame |
| **P_slyrim ×2** | `drop(arm, RIMSET(SLY-*))` ≤ **0.6 L** ∧ `hit(arm, RIMSET(SLY-*))` ≤ **0.12** | both, per shot |
| LOOK | §5 | **BINDING**, adjudicated in the RESULT off the scorer's crops |

Every band above except `BG_char`, `BG_disc`, `V3` and `P_slyrim` is PREREG-seamglint §4's,
carried at its sealed value. **No band has been moved** — the parent's arms failed E, and a
follow-up that loosened E would be §141.1's exact prohibition.

**Ship rule (registered):** the FIRST arm in this order whose bars ALL pass, and whose crops
pass the LOOK gate, ships:

1. `w35` — `TUNE.rimFloorOffCut = 0.35` alone (one constant; off-subject floor 0.10)
2. `w45` — `TUNE.rimFloorOffCut = 0.45` alone (off-subject floor 0.00)
3. `b35` — `rimFloorOffCut = 0.35` **and** `rimShadowFloorArch = 0.10`
4. `b45` — `rimFloorOffCut = 0.45` **and** `rimShadowFloorArch = 0.10`

Screen-only before combined (smallest intervention first), and within each family the LARGEST
surviving floor first — PREREG-kerb's registered-rule form. No arm qualifying → no ship (§6).
`k10` and `rimz` gate nothing; they are the decomposition the RESULT reports either way.

## 5. §17 look declaration and the LOOK gate

Intended change: unlit ARCHITECTURE stops sparkling at seams and bevels — dunes' pylon face
reads as calm shadowed masonry (ink + texture intact), night and guard walls lose the cyan
pepper, hero's kerb band (the PREREG-kerb artifact) fades. NOT intended, and each has a bar:
lit-side rims (`mix(floor, 1, edge.b) → 1` as the lit mask rises), the CHARACTER's rim at any
distance (subject-scoped + dilated), the courtyard obelisk silhouette, night deck-edge
silhouettes, lantern sparkles (FX quads, a different pass entirely).

LOOK gate (all BINDING, adjudicated in the RESULT off the scorer's crops):
1. dunes pylon 4× — the glints gone, the masonry still reads as masonry;
2. night wall 3× **and** night deck-edge 3× — the rooftop still separates (the §24.3/night
   contract is what the 0.45 bought, and PREREG-kerb's V3 lesson is that this is the half that
   dies quietly);
3. guard wall 3×;
4. hero kerb 3×;
5. courtyard obelisk 3× — tip sparkle and silhouette intact;
6. **sly-closeup 1× and 2×, sly-profile 1× and 2× — Sly's shadow-side silhouette rim must be
   indistinguishable from `off`.** This is the gate the seal exists to carry; a mechanical
   P_slyrim pass with a visibly thinner rim is a FAIL.

## 6. Falsifiers and outcome branches — revert, do not defend

1. **PF1 (screen-only insufficient):** `w35`/`w45` fail an E bar ⇒ they do not ship; the rule
   steps to the combined arms. Recorded, not retuned.
2. **PF2 (nothing sufficient):** all four candidate arms fail an E bar on valid captures ⇒
   **NO SHIP**, both constants stay where HEAD has them. The glints are then not the two
   shadow-side floors' population at all, and the per-arm decomposition table (with `k10` and
   `rimz` bracketing the two terms' total shares) routes the item to a new mechanism — most
   likely the edge pass's own `edge.g` derivation on shallow depth steps, which is a different
   owner and needs its own seal. `guard` is the named risk (§7).
3. **PF3 (character cost):** a P_slyrim bar fails at an arm ⇒ that arm dies, whatever its E
   bars did. All arms dying this way ⇒ NO SHIP and a finding that the prepass subject mask is
   not a sufficient scope for this pass (dilation radius, or the rim band being wider than one
   texel) — that is a mechanism finding, and it lands in the RESULT with the crops.
4. **PF4 (instrument blind):** `BG_char` or `BG_disc` out ⇒ the character block VOIDs and NO
   arm may ship on it. VOID is not PASS.
5. **PF5 (validity):** V1/V2/V3/BG out, or any `R_<shot>` ≠ 0 ⇒ the affected blocks VOID,
   fail-closed; archive `mv progress/records/fxfix1 progress/records/fxfix1-void-runN`,
   diagnose from readbacks/stamps, relaunch. No resume (PF7 in the runner). A used out-dir is
   an operator decision, never a resume.
6. **PF6 (night look):** mechanical PASS but the night deck/rooftop crops read as mud ⇒ the
   LOOK gate (binding) kills the arm. Do not retune toward the band (§141.1).
7. **PF7 (postfx fell back):** `V3` catches a composite that failed to compile and degraded to
   direct rendering — the one failure mode of a new shader branch that would otherwise produce
   a plausible-looking frame with none of the pass in it (§210.2's class). VOID, fix, relaunch.

## 7. Registered forecast (ledger per §303)

**`b35` ships (~35%); `b45` ships (~15%); no ship ~45%; `w35`/`w45` ship ~5%.**

Grounds: the screen-only arms cannot reach E_dunes' 0.35 — s10 measured 0.77 remaining at
screen floor 0.10 with the arch floor at base, and taking the off-subject floor to 0.00 buys a
little more, not 2×. The combined arms are the arithmetic candidate: if the two terms'
populations were disjoint, dunes lands at 0.42 × 0.77 ≈ 0.32 (bar 0.35) and night at
0.49 × 0.90 ≈ 0.44 (bar 0.45) — **both inside their bands by a few percent, which is exactly
how thin this is**, and the sets are not guaranteed disjoint.

Honest uncertainties, named before the frames: (i) **guard is the likely killer** — the arch
floor left 0.87 there and the screen floor's share on `guard` was never measured (s10 ran on
dunes/night only), so E_guard is a coin flip; (ii) the character bar could fail on the OUTER
half of Sly's rim if the band is wider than the one-texel dilation (probability ~20%, PF3);
(iii) `P_nightbudget` at 12% has 3.7 points of headroom over the arch arm's 8.3% and the
screen cut adds to it (~15%); (iv) dunes/night landing 0.32/0.44 against 0.35/0.45 means a
population shift of a few dozen pixels decides the seal — recorded now so that a miss by 0.01
is read as the coin flip it is and not as an argument for a different band.

## 8. SCORING RECIPE (exact commands; every outcome branch)

The runner is DETACHED. Do not wait interactively; the FIFO may hold it behind five other
lanes' runs.

1. **Is it done?** `tail -5 /home/user/Demo/progress/records/logs/fxfix1-run1.log` — done =
   the last lines are `DONE. Score with:` + the two scorer paths. `ABORT`/`PF` lines: the log
   says which guard fired. Liveness: `pgrep -f 'fxfix[1]\.mjs'` (bracket pattern) or check
   `/tmp/sands-of-ra/fxfix1.pid` against `/proc`.
2. **Score:** `cd /home/user/Demo && node progress/records/fxfix/rimfloor2-score.mjs`
   (exit 0 = some arm passed mechanically; exit 1 = no arm passed). Then LOOK at
   `progress/records/fxfix1/crops/rimfloor2-*` — §5 is BINDING and no verdict line is a ship
   decision without it.
3. **PASS (mechanical + LOOK) → ship-write.** §296 first: confirm
   `/tmp/sands-of-ra/capture.lock` is absent AND `/tmp/sands-of-ra/queue/` is empty
   IMMEDIATELY before touching src, and `git status` shows no other lane mid-edit in the files
   below. Then ONE commit citing `RESULT-rimfloor2.md`, staging ONLY these paths:
   - `src/render/PostFX.js`: `rimFloorOffCut: 0.0` → the chosen value, and replace the knob
     comment's last paragraph with: "SHIPPED at &lt;v&gt; per RESULT-rimfloor2.md
     (PREREG-rimfloor2 one-boot sweep): the off-subject screen-rim floor owned the residual
     seam glints (dunes/night/guard/kerb E bars green); the character's shadow-side rim is
     pinned by the dilated ledger #31 mask and measured unmoved (P_slyrim &lt;drop&gt; L)."
   - **combined arms only** — `src/render/ToonMaterial.js`: `rimShadowFloorArch: 0.55` → 0.10,
     replacing that knob comment's last two sentences with the same citation. The `vSlySkin`
     exemption line in `toon.glsl.js` is NOT edited: it is what keeps the character at exactly
     0.55 and `tests/rimfloor2.test.mjs` asserts its spelling.
   - `tests/rimfloor2.test.mjs`: flip the two inert assertions to the shipped values (keep the
     branch/dilation/spelling assertions and the `vSlySkin` contract assertion as they are).
   - `node --test "tests/*.test.mjs"` — all green before push.
   - Write `RESULT-rimfloor2.md` + a KNOWN_ISSUES § in the same push.
4. **PF1/PF2/PF3 (no ship):** NO src write. `RESULT-rimfloor2.md` + KNOWN_ISSUES § carrying
   the per-arm decomposition table (`k10`/`rimz`/`w*`/`b*` shares per ROI) and the routing.
5. **PF4/PF5/PF7 (VOID):** archive
   `mv progress/records/fxfix1 progress/records/fxfix1-void-run1`, diagnose, relaunch with
   `bash tools/launch.sh progress/records/fxfix/fxfix1.mjs /home/user/Demo/progress/records/logs/fxfix1-run2.log /tmp/sands-of-ra/fxfix1.pid`.

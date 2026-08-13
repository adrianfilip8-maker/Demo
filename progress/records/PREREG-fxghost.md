# PREREG-fxghost — the sandHigh ghost-disc FIX seal: cut the pool's key-lit leg (litMix sweep), one boot, poke arms

**Lane:** POSTFX/FX artifact family (critic r11 family 3, RESULT-critic11 queue item 2).
**Parents:** §135/§138 (mechanism), PREREG-sandhigh.md + Amendment 1 (the acceptance
architecture), RESULT-fx22 (candidate 1 REJECTED — the leak record this design must answer),
§298.2 + RESULT-critic10-postfx item 2 (attribution EVIDENCE-GRADE: temple +19.9 over the
star ceiling reproduced cross-boot a third time; night +12.8; `sandLow`/`shimmer` own 0.00).
**Date sealed:** 2026-08-13.
**Status: REGISTERED before any capture. `progress/records/fxartifact1/` does not exist and
no frame of any arm has been rendered.** Runner `progress/records/fxartifact/fxartifact.mjs`
and scorer `progress/records/fxartifact/fxghost-score.mjs` are committed with this file.
The runner is SHARED with PREREG-fxink and PREREG-seamglint (one boot, one lock window,
per-shot poke arms); the three seals register, score and ship INDEPENDENTLY — this file's
verdict consumes only the rows named here.

## 1. Ownership and discipline

Torchlight3 §1 carried verbatim: bars sealed and pushed before any candidate frame; no
post-hoc threshold moves (§141.1); fail-closed (VOID is not PASS); the runner launches
DETACHED via `tools/launch.sh` (§298.3) and installs/restores its one src file only inside
its lock window (§186); no src commit while any capture runs or queues (§296); on this
renderer same-boot per-shot off/on/back is the only valid [0,0] form (§302/§303).
`ringPainter` untouched (D12 absolute). This seal's SHIP surface is ONE constant:
`src/fx/Emitters.js` `AMBIENT.sand_haze.litMix` — written only on this seal's PASS, only at
a clear lock, per §6. The A/B lever itself is a live uniform poke (no src bytes involved).

## 2. The defect, the mechanism evidence, and why THIS candidate

r11 (verbatim): "bloom/bokeh ghost discs floating in temple (magenta)/sly-profile (120 px
orange)/interior/night." The attribution is already evidence-grade and is NOT re-litigated
here: hiding `sandHigh` removes the discs (3 replications across boots/trees).

New offline decomposition on the committed c10postfx frames (scratchpad ghostdecomp,
2026-08-13, PNG arithmetic only — reproduced in this seal because two of its numbers pick
the candidate):

- **The disc's ADD is the WARM leg.** diff(base, no-sandHigh) per component:
  temple 2,432 px at (602,138)-(656,194): mean add RGB **[+61.9, +10.5, −5.8]** over
  backdrop (8.5, 50.7, 96.6) — an almost purely RED add over the blue star ceiling.
  night components add [+23.6,+11.8,+1.9], [+21.5,+11.9,+1.3], [+25.3,+4.7,−4.5],
  [+17.0,+6.7,+0.3] — warm adds over night-dark backdrops, every one.
- **Bloom owns 0.00 of it.** Over the sealed night ghost box, mean L(base − bloomoff) =
  **0.00** across 2,400 px. r11's "bloom/bokeh" is the critic's look-description of soft
  discs, not the mechanism; recorded so the "re-fed through bloom" phrasing stops traveling.
- r11's sly-profile cluster measures meanL 158.3 vs its shadowed wall 96.7 (+61 L), max 187
  — far below the bloom-feed display class: the sprite body itself, key-tinted orange.

The sprite's color model (`Particles.js` PARTICLE_VERT, LIT):
`col = sand × mix(uAmbTint, uLightTint·boost, uLitMix)` with `sand_haze.litMix = 0.52` and
`uLightTint` = the key's color·intensity. The pool is lit by the KEY at full strength
wherever it floats — inside shadowed air (sly-profile), against the unlit star ceiling
(temple, plus ×3.6 shaft boost inside a blade), against the night sky — while its designed
invisibility ("sand-coloured sprites over sand-coloured geometry", Emitters.js) holds only
where the backdrop is key-lit sand. **The candidate cuts the key-lit leg**: `uLitMix` on the
`sandHigh` batch (a live per-batch uniform, construction-only write — poke-sticky), sweep
**{0.26, 0.13, 0.00}**, ship rule = the LARGEST value passing every bar (the PREREG-kerb
sweep form; the decision rule is registered here, not chosen after the frames).

Why this answers RESULT-fx22's leak record: candidate 1 died on its spatial PROXY (a
backdrop gate that fired far beyond the one wrong pairing — 53 named violations). This
candidate has NO spatial selector at all: one uniform recoloring one pool, every other batch
untouched by construction (`uLitMix` is per-batch material state). Its failure mode is not
leakage but INSUFFICIENCY (the ambient-leg body may still read over dark backdrops) or
exterior COST — both measured below, both fail-closed. §138.1–.2's refuted knobs
(near-fade, screen-size) are not touched.

## 3. Arms, ROIs and instruments

Shots consumed by this seal (staged once each, {dt:0}, torchlight3 staging): `temple`,
`night`, `interior`, `sly-profile`, `dunes`, `hero`, `courtyard`. Arms per shot, in order,
each applied RESTORE-FIRST from the all-base state, each captured after `step(2,0)` +
`renderFrame(0)`, each with §40 readbacks and a per-capture tree stamp (§296):

`off` (all base: litMix 0.52) → `ahide` (sandHigh mesh hidden — the pool-free reference) →
`a26` (uLitMix 0.26) → `a13` (0.13) → `a00` (0.0) → [PREREG-fxink's and PREREG-seamglint's
arms for shots they share] → `back` (all base). diff(off, back) brackets EVERY intervening
poke of the shot (torchlight3 §6's property).

Registered ghost ROIs [x0,y0,x1,y1] (the c10postfx run-2 components, {dt:0} staging = this
run's staging; temple's box carries the disc at this staging — torchlight3's temple.off
measures meanL 62.3 in-box vs 45-class ceiling around it):

- G1 temple [602,138,656,194] — the star-ceiling disc, the 3×-replicated anchor
- G2 night [152,23,198,69] · G3 night [753,342,787,383] · G4 night [954,43,988,71] ·
  G5 night [465,154,497,193]

Statistic: **amp(arm, G) = meanL(arm) − meanL(ahide) over G** — the residual the pool leaves
over the pool-free picture, same-boot. Ratio r = amp(arm)/amp(off).

Field-cost instrument (exteriors {dunes, hero, courtyard}): **C(arm) = Σ|ΔL| over px with
|L(arm) − L(ahide)| ≥ 2**, whole frame — the pool's visible contribution vs the same-boot
hidden reference; ratio C(arm)/C(off). **Disclosed deviation from PREREG-sandhigh Arm B
(±15%):** Arm B's letter was written for REMOVAL candidates (screen-size, alpha-thinning,
vertical box), where contribution loss IS the harm. A recolor keeps the sprite population
and geometry; its success over dark backdrops (sprite ≈ backdrop) NECESSARILY moves the
contribution statistic. The registered recolor band is **C ∈ [0.40, 1.60] × C(off)** with
the footprint ratio n(arm)/n(off) REPORTED (no gate), and the exterior LOOK gate BINDING
(§5). If the coordinator reads Arm B's ±15% as binding on recolors too, the ship defers to
that reading (outcome branch §6.4) — stated now, before any frame exists.

Sparkle/halo protections (PREREG-critic10-postfx B4's ROIs carried verbatim):
night LAMPS [660,0,779,59], MOON [380,50,439,109]; interior TORCH-A [1004,175,1031,218],
TORCH-B [280,190,307,227]: |meanL(arm) − meanL(off)| ≤ 1.0 per ROI per arm. (These guard
the named "night lantern sparkles" and torch halos against any overlap effect; `spark`,
`motes`, `airMotes`, `SparkleField` materials are untouched by construction.)

`interior` and `sly-profile` ghost census: r11's discs there were staged by the critic's
LIVE-clock harness; at this run's {dt:0} staging the c10postfx boot found no ≥150 px
component on sly-profile — so these two shots carry NO gating ghost bar. They are captured
for the LOOK gate (whole-frame off vs a00 crops) and a component census is REPORTED.

## 4. Registered bars (scored by fxghost-score.mjs; VOID is not PASS)

| id | quantity | band |
|---|---|---|
| V1 | one src content hash across all rows == manifest's expected install hash | else VOID |
| V2 | §40 readbacks: every consumed arm's levers at commanded values, others at base; sandLive ≥ 1 | else VOID |
| R_<shot> ×7 | diff(off, back) strict px | **[0,0]** each; a nonzero VOIDs that shot's rows (fail-closed) |
| BG_G1 | amp(off, G1) | **≥ +8 L** else the temple block is VOID (defect absent at staging) |
| BG_G2 | amp(off, G2) | **≥ +5 L** else the night block is VOID |
| GH_G1 | at the candidate arm: r ≤ **0.30** ∧ amp ≤ **+6.0 L** | both |
| GH_G2 | r ≤ **0.35** ∧ amp ≤ **+5.0 L** | both |
| GH_G3/G4/G5 | r ≤ **0.55** each | all |
| F_dunes/hero/courtyard | C(arm)/C(off) | **[0.40, 1.60]** each |
| HALO ×4 | \|Δ meanL\| vs off | **≤ 1.0 L** per ROI |
| LOOK | §5 | **BINDING**, adjudicated in the RESULT off the scorer's crops |

**Ship rule (registered):** the candidate = the LARGEST litMix ∈ {0.26, 0.13, 0.00} whose
arm passes ALL bars above, AND the LOOK gate passes on that arm's crops. No arm qualifying →
no ship (§6 branches). The scorer prints the per-arm table and the mechanical choice; the
RESULT decides, after the crops have been looked at.

## 5. §17 look declaration and the LOOK gate

Intended change: the sandHigh veil stops being key-lit — over dark backdrops (star ceiling,
night sky, shadowed walls) the discs lose their warm lift and sink toward the ambient level;
in daylight exteriors the veil may read slightly cooler/dimmer (the sand_drift retint
precedent — that pool ships at litMix 0.44 with `sandMid/sandDark` for this exact reason).
The LOOK gate, adjudicated in the RESULT with the scorer's crops, all BINDING:
1. temple G1 at 4×: the mauve disc no longer reads as a disc over the star ceiling;
2. night G2/G3 at 4×: the mauve circles no longer read;
3. dunes/hero at 1× and 2×: the haze field still present and reads as airborne sand, not
   smoke or dirt (the §138.4 anti-thinning clause's look half);
4. interior + sly-profile whole-frame: no NEW disc artifacts introduced.

## 6. Falsifiers and outcome branches — revert, do not defend

1. **PF1 (insufficient):** every arm fails a GH bar on a valid capture ⇒ litMix cannot say
   "invisible" — the ambient-leg body carries the disc. `litMix` stays 0.52; the finding +
   per-arm decomposition table route the item to the next design (§138.5's enclosure/zone
   gate for the interiors + a night-scoped device), each needing its own seal.
2. **PF2 (exterior cost):** GH bars pass but an F bar fails ⇒ no ship at that arm; the ship
   rule already steps to the next-largest arm; all arms failing F ⇒ no ship, finding
   recorded (the recolor is not free — quantified for the next design).
3. **PF3 (validity):** V1/V2/BG out ⇒ VOID, archive `fxartifact1/` as
   `fxartifact1-void-runN/`, diagnose from readbacks/stamps, re-run. No resume (PF7 in the
   runner). A used out-dir is an operator decision, never a resume.
4. **PF4 (Arm-B reading):** the coordinator holds recolors to PREREG-sandhigh Arm B's ±15%
   ⇒ ship defers pending that adjudication; the frames and table stand either way.
5. **PF5 (killed mid-boot):** `git status` shows `src/render/PostFX.js` modified ⇒
   `git checkout HEAD -- src/render/PostFX.js`; archive the out-dir; relaunch. (The install
   belongs to PREREG-fxink; it rides the shared runner.)
6. Any R_<shot> ≠ 0 ⇒ that shot's rows VOID (fail-closed), diagnose ordinal/timestamps
   (§296-f3 sag within a boot would be a NEW finding, not a verdict).

## 7. Registered forecast (ledger entering 5/18 per §303)

**a13 (litMix 0.13) ships.** Grounds: the disc's add is 84%-warm-channel (G1's +61.9R vs
−5.8B) and the lit leg carries the boost term too, so r(a13) ≈ 0.25×the-warm-share ≈ 0.3 is
reachable; the exterior field's daylight read is pairing-dominated (±2 L class) so F bands
hold. Honest uncertainties, named: (i) the amp model cannot split the amb-leg's share —
if the amb body alone exceeds +6 L over the star ceiling, GH_G1 fails at every arm (PF1;
probability ~35%); (ii) the dunes veil may lose its warm read at 0.13 and fail LOOK
(probability ~20%); (iii) staging absence of G2-G5 at this boot voids the night block
(low; the boxes reproduced across three boots).

## 8. SCORING RECIPE (exact commands; outcome branches)

The runner is DETACHED. Do not wait interactively; the FIFO may hold it behind other lanes.

1. **Is it done?** `tail -5 /home/user/Demo/progress/records/logs/fxartifact-run1.log` —
   done = last lines are `DONE. Score with:` + the three scorer paths. `ABORT`/`PF` lines:
   the log says which guard fired; see §6.3/§6.5.
   Liveness: `pgrep -f 'fxartifac[t]\.mjs'` (bracket pattern) or check
   `/tmp/sands-of-ra/fxartifact1.pid` against `/proc`.
2. **Score:** `cd /home/user/Demo && node progress/records/fxartifact/fxghost-score.mjs`
   (exit 0 = some arm passed mechanically). Look at `progress/records/fxartifact1/crops/
   fxghost-*` — the LOOK gate is §5 and it is binding.
3. **PASS (mechanical + LOOK) → ship-write.** §296 first: confirm
   `/tmp/sands-of-ra/capture.lock` absent AND `/tmp/sands-of-ra/queue/` empty IMMEDIATELY
   before touching src. Then in ONE commit citing RESULT-fxghost.md:
   - `src/fx/Emitters.js`: `sand_haze` `litMix: 0.52` → the chosen value; extend the pool's
     comment: "litMix cut 0.52 → <v> per RESULT-fxghost.md (PREREG-fxghost one-boot sweep):
     the key-lit leg owned the §135/§298 ghost discs (temple star ceiling +19.9 → <amp>);
     the ambient-leg veil keeps the field's exterior read (F bars + LOOK)."
   - `tests/fxghost.test.mjs` (new): import `AMBIENT` from `src/fx/Emitters.js`, assert
     `AMBIENT.sand_haze.litMix === <v>` with a message citing RESULT-fxghost.md, and assert
     `AMBIENT.sand_drift.litMix === 0.44` (the neighbour this seal must not have touched).
   - `node --test "tests/*.test.mjs"` — 475+ green before push.
   - Write `RESULT-fxghost.md` + a KNOWN_ISSUES § (every branch writes these two).
4. **PF1/PF2:** no src write. RESULT + KNOWN_ISSUES § with the decomposition table; route
   per §6.1/§6.2.
5. **VOID:** archive `mv progress/records/fxartifact1 progress/records/fxartifact1-void-runN`,
   diagnose, relaunch via
   `bash tools/launch.sh progress/records/fxartifact/fxartifact.mjs progress/records/logs/fxartifact-run2.log /tmp/sands-of-ra/fxartifact1.pid`.

# PREREG-tombdim2 — the PAIRED interior seal: the ambient goes down and the pool term goes up in the SAME arm

**Lane:** LIGHTING/grade (TOMBDIM2; parent `PREREG-tombdim.md` → `RESULT-gradetrio.md` →
KNOWN_ISSUES §307. Evidence in the record: §303 the SHIPPED torch pools — `TUNE.localToon`
2.5, live, and this seal's co-lever; §302 same-boot-only pixel bars; §300 no new coloured
fills; §308 critic r12's interior critique). **Date sealed:** 2026-08-14.

**Status: REGISTERED before any capture. `progress/records/tombdim21/` does not exist at the
time of writing and no frame of any arm has been rendered.**
**Provenance (§311):** this file and its four scripts were staged in the shared index when the
coordinator ran a non-pathspec `git commit`, so the seal landed inside **08a5440** — a commit
whose message is about the §1 budget correction and has nothing to do with this lane. The
content is this lane's final intended state (verified by an empty `git diff HEAD` over the
five paths immediately afterwards), and it was pushed BEFORE any frame of any arm, which is
what the discipline requires; only the provenance is odd. A reader tracing "when was tombdim2
sealed" should read **08a5440** (+ this note's own commit, which changes no band, arm,
threshold or command). The runner
(`progress/records/tombdim2/tombdim2.mjs`), the scorer (`tombdim2-score.mjs`), its lib
(`tombdim2-lib.mjs`) and the band-derivation model (`t2model.mjs`) are committed with this
file, before the capture. **This seal writes NO src/ byte before the capture and installs
nothing**: both levers already exist in HEAD as live per-publish `debug` overrides, so the
whole A/B is pokes on the HEAD tree (§296 exposure: none — no other lane's in-flight capture
can be voided by this seal's pre-launch commits, and nothing needs the lock until the run
itself queues for it).

## 0. Why the parent failed, and what "paired" means arithmetically

§307, measured: the ambient-only dim at `tombAmb` 0.30 **achieved the darkness** (FAR 63.9 →
39.7 L, VAULT 74.1 → 42.2) and even improved the pool ratio (1.49 → 1.91) — but it **dragged
the pools and the gold down with it**: POOL 95.0 → 75.7 L, SARC 72.2 → 50.7. D2 and D4 failed
as registered and `tombAmb` stayed 1.0. The mechanism finding was explicit: *the torch pools
ride the ambient term more than the model predicted, so a pure ambient dim cannot
brighten-by-contrast alone.*

That is not a mystery, it is arithmetic. In `toon.glsl.js` the pool term is
`diff += alb * min( slyLocalAcc * uLocalToon, 1.6 )` — an ADD on top of a base the ambient
family owns. Killing 70% of the base moves the sum down even though the add is untouched;
what changes is only the RATIO. Measured on the parent's frames and inverted through the
shipped grade chain (`t2model.mjs`), the pool-owned fraction of each rect is:

| ROI | POOL | JARS | JARST | GOLD | SARC | CTRL | FAR | VAULT |
|---|---|---|---|---|---|---|---|---|
| pool-owned share of radiance | 39% | 27% | 42% | 26% | 22% | 19% | 8% | ~0% |

So at `tombAmb` 0.30 even the POOL rect loses 61% of its radiance base. **The fix is to pay
the pool leg back through its own gain**, which is live and shipped: `TUNE.localToon` 2.5
(§303). Critic r12 states the same thesis from the picture side — *"drop ambient by ~70% and
let the torch pools own the exposure — darkness is what makes the warm/cool tension and the
sarcophagus focal possible"* (§308). This seal registers DOSE PAIRS: **(tombAmb, localToon)**
moved together in one arm, with the parent's ambient-only dose kept as the CONTROL that
reproduces the known failure inside the same boot.

**What this seal is licensed NOT to do.** No new colour anywhere (§300): the only colour that
arrives is the torch pools' own, already shipped. No change to the pool MECHANISM — §303's
GLSL term, its `y < -0.5` underground gate, its 1.6 cap and its publish path are untouched
byte-for-byte; only the registered GAIN moves, and only on a PASS with this seal's RESULT
cited (the `rakeTrack`/`shadowFloorNight` precedent, RESULT-gradetrio). No above-ground pixel.
No fix for the GOLD MATERIAL — see §9, which registers before the capture that this pair
cannot make the sarcophagus out-brighten the alabaster jars and says why.

## 1. Ownership and discipline

Src surface for the CAPTURE: **none** (HEAD is the tree; arms are `debug.tombAmb` and
`debug.localToon` pokes, both recomputed from the live camera/TUNE on every
`_publishKeyLight` → `setKeyLight`, so poke and restore are exact by construction and pinned
by `tests/tombdim.test.mjs` / `tests/torchlight.test.mjs`). Src surface for a SHIP: two TUNE
values and their two pin tests (§10). Bars sealed and PUSHED before any candidate frame; no
post-hoc threshold moves (§141.1 — the re-aims this seal makes against its parent are
declared in §4/§6.2 and land in THIS file, before the capture, never retrofitted into the
parent's); fail-closed tri-state through `tools/gate.mjs`; no src edit under another run's
lock (§186); no src commit while any capture runs or queues (§296); `ringPainter` untouched;
runner launched detached via `tools/launch.sh` with absolute log + pidfile paths (§298.3).

## 2. The candidate — two knobs, one arm

- **`TUNE.tombAmb`** (`src/render/ToonMaterial.js`, default **1.0** = gate `tombAmb < 1`
  untaken). Multiplies the ambient family — the published `ambient.intensity` on arrival AND
  the floor feeding `_refreshShadowColor`'s k — scoped by camera height,
  `w = smoothstep(-0.5, -2.5, camera.y)`, `f = tombAmb + (1 - tombAmb) * (1 - w)`. At the
  staged interior camera (y −9.2) `w == 1` and `f == tombAmb` EXACTLY (the `x + 0` spelling).
  Every above-ground canonical sits at y ≥ 1.15 → `w == 0` → `f == 1` → `x * 1 == x`.
- **`TUNE.localToon`** (`src/render/Lighting.js`, **2.5 SHIPPED**, §303). Published per frame
  as the payload's `local`; `setKeyLight` writes `uLocalToon`; the shader multiplies each
  point light's lambert term by it and caps the sum at 1.6 scene-linear, **gated on the
  emitter's world height `y < -0.5`** — the six tomb sconces only; every above-ground fire
  multiplies by exactly 0.0 (§303 measured that as [0,0] on all fifteen above-ground shots).

Both are `debug`-overridable live, which is what makes a one-boot poke A/B legitimate here.
**Exact predictions the readback bar asserts** (from `t2model.mjs` §(1), driving the real
`evalAtmosphere` + `Shading.setKeyLight` at tod 0.5, camera y −9.2):

| tombAmb | uAmbIntensity | == off × tombAmb | uShadowColor lum ratio (the §261 cap release) |
|---|---|---|---|
| 1.00 | 0.5863987921718226 | — | 1.0 |
| 0.30 | 0.17591963765154675 | exact | **0.40879** (the parent MEASURED 0.4088) |
| 0.45 | 0.26387945647732014 | exact | **0.61319** |

## 3. Tree — HEAD, no install, nothing to restore

The runner records the launch-time `git archive HEAD` src hash and requires every manifest
row's `treeState().src` to equal it (V4, per-capture stamps). **PF6 launch pins**, all read
from HEAD with `git show` so another lane's installed files cannot spoof them:
`HEAD:src/render/ToonMaterial.js` carries `tombAmb: 1.0` + `debug?.tombAmb`;
`HEAD:src/render/Lighting.js` carries `localToon: 2.5` + `debug?.localToon` (a flipped default
on either means a ship write landed and this seal is stale); `HEAD:src/render/shaders/
toon.glsl.js` carries `uLocalToon > 0.0`, `slyLocalY < -0.5` and `SLY_LOCAL_CAP = 1.6`;
roster == the 16 canonicals.

**Working-tree cleanliness is checked at LOCK GRANT, not at enqueue** (`onLocked`: `src/`
clean AND its hash == the launch-derived archive hash, else abort). At enqueue another lane
may legitimately hold the lock with its own CAND files installed — it restores them before it
releases — so a queued runner that demanded a clean tree at enqueue would abort on someone
else's correct behaviour. At seal time exactly that is true: `guardcone.mjs` holds the lock
with an installed `ToonMaterial.js`/`toon.glsl.js`, and two more runners are queued ahead of
this one. §186 stands: this lane touches none of it.

## 4. ROIs and statistics (registered; the shadowhold rule — derived by looking at BASE-tree
frames, `progress/records/gradetrio1/interior.off.png`, and bars are read on the `off` arm)

Display bytes, Rec.709 L, statistics spelled once in `tombdim2-lib.mjs` (the parent family's
lens verbatim, which is what licenses carrying its rects by citation).

**The base frame is the same picture function as the parent's.** Two levers shipped between
the parent's boot and this seal (`rakeTrack` 1.0, `shadowFloorNight` 0.14), and both are
arithmetically inert on this shot — MEASURED, not argued: in the parent's own boot,
`interior.off` vs `interior.con` (rakeTrack 1.0) = **0 px** and vs `interior.don`
(shadowFloorNight 0.14) = **0 px**, while the same arms moved hero by 80,197 px and night by
741,132 px. BG (§6) re-verifies the base bands on the fresh `off` arm anyway; a drift VOIDs.

| ROI | rect | derivation (parent's `interior.off`, pools LIVE at localToon 2.5) |
|---|---|---|
| FAR | [380, 30, 560, 120] | carried by citation (PREREG-tombdim §4). L 63.9, R−B −14.7. **8% pool-owned** — reported, not the coolness bar's population (see §6.2) |
| VAULT | [560, 10, 900, 90] | carried by citation. L 74.1, R−B −14.9. **~0% pool-owned** — the CLEAN ambient-owned rect, and this seal's darkness + coolness population |
| POOL | [292, 432, 392, 490] | carried by citation (the torchlight POOL rect, so §303's dose data applies to it directly). L 95.0, R−B +75.4 |
| CTRL | [150, 560, 520, 700] | carried by citation. Floor between pools, a pool+ambient mix: L 84.8, R−B +35.9 |
| SARC | [600, 120, 840, 300] | carried by citation (sarcophagus + dais + the wall behind). L 72.2, R−B +11.0 |
| **GOLD** | [600, 155, 840, 290] | **NEW.** The treasure itself — mask, chest, gold plinth band, minus the upper wall band the parent's SARC included. L 72.5, R−B +11.6, 26% pool-owned |
| **JARS** | [800, 455, 882, 508] | **NEW.** The brightest non-flame population in frame — r12's *"jars outshining the treasure"*. L 124.0, R−B +28.5 |
| JARSL / JARST | [437,362,495,458] / [368,336,440,420] | **NEW**, reported only: the other two jar clusters (L 110.9 / 117.2) |

Whole-frame POPULATION diagnostics (meanL, sd, cool% at R−B ≤ −5, warm% at R−B ≥ +20, dark%
at L < 40, bright% at L > 120) are printed for every interior arm and **never barred** —
`t2model.mjs` is a per-ROI-mean model and cannot predict a population, so these inform the
LOOK gate instead of gating the ship. Their base values: 79.7 / 30.1 / 23.9% / 50.8% / 8.4% /
7.3%, and the parent's 0.15 arm (the reference for "monochrome warm cave") sits at 46.9 /
30.1 / 14.9% / 72.6% / 50.8% / 2.1%.

## 5. Arms and the boot (`tombdim2.mjs`; frames → `progress/records/tombdim21/`)

Carried mechanics from PREREG-tombdim §5 / PREREG-redkey §5: quality high, 1280×720,
`setShot(name, {dt:0})` → `step(3,0)` → `renderFrame(0)` staging (§251, not captured), roster
order, per-arm readbacks, PF7 fresh out-dir, no retries, no manifest resume. **ONE boot, HEAD
tree, no install.** Both levers are set to their defaults before the first staging (uniform
staging disclosure); every arm assigns BOTH levers (restore-first), so `back` is the `off`
assignment repeated and diff(`off`, `back`) brackets every intervening poke of that shot.

| arm | tombAmb | localToon | shots | role |
|---|---|---|---|---|
| `off` | 1.00 | 2.5 | all 16 | the shipped state = the diagnosed base |
| `amb` | 0.30 | 2.5 | interior | **CONTROL — the parent's arm.** Registered to FAIL D2/D3 inside this boot |
| `pool` | 1.00 | 6.0 | interior | **CONTROL** — pool-only; isolates the co-lever and replicates §303's KO1 dose in a new boot |
| **`p30`** | **0.30** | **6.0** | interior | **CANDIDATE 1** — r12's thesis: ambient −70%, pool paid back at a gain §303 has already MEASURED (39.8 L @6.0) |
| **`p45`** | **0.45** | **4.0** | interior | **CANDIDATE 2** — the milder pair (ambient −55%) |
| `p30hi` | 0.30 | 8.0 | interior | **DOSE arm** (KO; measures the cap saturation above the record's k = 6.0). **Not a ship candidate** |
| `xtr` | 0.30 | 8.0 | 15 above-ground | the protection arm: the most extreme pair |
| `back` | 1.00 | 2.5 | all 16 | validity bracket |

15 × 3 + 7 = **52 frames**. `xtr` is the extreme pair on purpose: above ground the tombAmb
weight is exactly 0 (factor exactly 1) and every fire is above the shader's gate (exactly
×0.0), so **if the extreme pair is 0 px, every milder pair is too, by the same arithmetic** —
and VB proves the pokes actually reached the uniforms on those shots (`uLocalToon == 8`)
rather than being silently dropped, which is the failure mode a weaker arm would hide.

**Lock-hold price (§298.3): ~35–70 min** — one boot 6–9 min, 16 stagings ≈ 10–55 min
(redkey's run-2 stagings measured 15–50 s), 52 poke arms ≈ 20–35 min.

## 6. Registered bars (scored by `tombdim2-score.mjs` through `tools/gate.mjs`; VOID is not
PASS; ship = every row PASS for a candidate arm **and** the LOOK gate §8)

### 6.1 The multiplicity rule, fixed before capture

Two ship candidates, **one bar set with identical bands**, and a **registered preference
order: `p30` then `p45`**. The ship is the FIRST candidate that passes every bar and the LOOK
gate. `amb` / `pool` / `p30hi` are controls and dose arms and can never ship from this seal;
if `p30hi` alone passes everything, that is a RECORDED FINDING routed to a new seal, not a
ship. If no candidate passes, PF1: both TUNE values stay where they are. No band below
depends on which arm it is applied to.

### 6.2 The bars

| id | quantity | band |
|---|---|---|
| **R1–R16** (`R_<shot>`) | diff(`off`, `back`) decoded differing px | **[0,0]** each — nonzero VOIDs that shot's rows (PF4). Same-boot only (§302) |
| **B_<shot>** ×15 | diff(`off`, `xtr`) decoded differing px, every non-interior shot | **[0,0]** each — the above-ground claim for BOTH gates at once |
| **BG** | `off`-arm staging gates: POOL R−B ≥ +40 ∧ POOL L ∈ [80,110] ∧ FAR L ∈ [50,78] ∧ FAR R−B ≤ −5 ∧ VAULT L ∈ [60,88] ∧ VAULT R−B ≤ −8 ∧ CTRL L ∈ [70,100] ∧ GOLD L ∈ [60,85] ∧ JARS L ∈ [110,138] | in → else **VOID** (the staging/tree is not the diagnosed one) |
| **D1** | darkness: VAULT L ratio (cand/`off`) ∈ [0.30, 0.72] ∧ FAR ratio ∈ [0.30, 0.85] | both |
| **D2** | **POOL absolute hold**: POOL L(cand) ≥ **0.90** × POOL L(`off`) | in — §307's ambient-only arm scored **0.797** here |
| **D3** | **SARC absolute hold**: SARC L(cand) ≥ **0.78** × SARC L(`off`) (GOLD hold reported) | in — §307 scored **0.702** |
| **H1** | **focal/hierarchy**: GOLD L − VAULT L ≥ **+12** ∧ SARC L − VAULT L ≥ **+8** | both — at `off` these are **−1.7 / −1.9**: the sarcophagus is currently DARKER than the vault behind it, which is the "no focal" defect in one number |
| **H2** | **hierarchy non-regression**: JARS L / GOLD L (cand) ≤ 1.15 × the same ratio at `off` (1.71) | in — the seal does NOT claim the inversion (§9); it bars making it worse |
| **W1** | **warm/cool separation**: [R−B(POOL) − R−B(VAULT)](cand) ≥ [same](`off`) + **30** | in — `off` = 90.3 |
| **W2** | **the darkness stays violet**: R−B(VAULT)(cand) ≤ **−8** | in |
| **CT** | floor between pools: CTRL ΔL (cand − `off`) ∈ [−34, −6] | in — the darkening must reach the floor's ambient leg without crushing it |
| **KO** | dose monotone on the co-lever: POOL L(`p30`) ≥ POOL L(`amb`) + 8 ∧ POOL L(`p30hi`) ≥ POOL L(`p30`) + 1.0 ∧ POOL L(`pool`) ≥ POOL L(`off`) + 5 | all three |
| **VB** | readbacks, every row: `debug` echoes == the arm ∧ `uLocalToon` == the arm's gain (the poke reached the uniform). Interior: camY < −2.5 ∧ `tombF` == tombAmb exactly ∧ uAmbIntensity == off × tombAmb (≤1e-12) ∧ uShadowColor lum ratio == §2's table (±5e-4). Above ground: `tombF` == 1 ∧ uAmbIntensity and uShadowColor bit-identical to `off` | else **VOID** |
| **V4** | 52 rows, ONE src hash == the launch-derived HEAD archive hash | else **VOID** |
| **LOOK** | binding, §8 | a look failure is **NO-SHIP** regardless of every bar |

Fail-closed gating: D1–CT/KO are VOID unless `R_interior` ∧ BG PASSED; each `B_<shot>` is VOID
unless its `R_<shot>` PASSED.

### 6.3 Where these bands come from, and the three re-aims against the parent (§141.1)

Every L band is read off `t2model.mjs`, whose out-of-sample residual against the parent's
UNFITTED third arm (tombAmb 0.15) is **worst 3.2 L** across nine rects; the bands carry
≥ 2 × that against the predicted arm values (predictions, `p30` / `p45`: POOL hold 0.949 /
0.934 vs bar 0.90; SARC hold 0.833 / 0.853 vs 0.78; VAULT ratio 0.504 / 0.678 vs 0.72;
GOLD−VAULT +25.5 / +13.1 vs +12; W 152 / 126 vs 120.4). **`p45`'s H1 and W1 margins are
thinner than the model's own error and are registered as genuinely uncertain** — the bar is
aimed at the claim, not at an arm.

Three bars are deliberately AIMED DIFFERENTLY from the parent's, registered here with their
reasons, in a new file, before any frame (§141.1 forbids moving a band after a capture; it
requires exactly this when a band was mis-aimed):

1. **The coolness bar moves from FAR to VAULT (parent D4 → this W2).** The parent barred
   R−B(FAR) ≤ −10 and MEASURED −5.6 at 0.30 — a FAIL. The diagnosis is now in hand: FAR is
   8% pool-owned and also carries the flames' bloom specks, so as the cool ambient is removed
   its residue is torch-warm and R−B rises **by construction**. VAULT is ~0% pool-owned and
   measured −14.9 → −14.4 across the parent's dim; it is the population the claim was always
   about. FAR's R−B is REPORTED at every arm.
2. **Absolute holds replace the parent's ratio-of-contrast D2.** The parent's D2 (POOL−FAR
   separation ≥ off + 6) is exactly the bar that passed on ratio while the picture lost 19.3
   L of pool, so it is not carried. D2/D3 here are ABSOLUTE (POOL ≥ 0.90 × off, SARC ≥ 0.78 ×
   off) because "the pools own the exposure" is an absolute-exposure claim, and the co-lever
   is what makes an absolute hold reachable at all.
3. **A focal statistic and a jars statistic are added (H1/H2)**, because r12's complaint is
   about HIERARCHY, not about contrast: at the shipped state the sarcophagus is 1.7 L DARKER
   than the vault wall behind it, and the jars are 1.71 × brighter than it.

`W2`'s band is NOT taken from the channel model (its VAULT R−B residual is ~10 units — the
split is ill-conditioned where the pool leg is ~0). It is aimed from the measured anchor:
VAULT sat at −14.4 at tombAmb 0.30 with the pool leg at 2.5; ×2.4 on a leg that is ~0–3% of
that rect should cost a few units, so the honest pre-capture estimate for `p30` is −10..−13
and the bar sits at −8. **If VAULT crosses −8 the darkness has stopped being violet and this
seal NO-SHIPs on the statistic that names the defect** — that is the intended failure mode,
not an accident of aim.

## 7. Falsifiers — revert, do not defend

- **PF1** — no candidate arm passes every bar ⇒ **no ship**: `TUNE.tombAmb` stays 1.0,
  `TUNE.localToon` stays 2.5, finding recorded. No retune toward a band; a different pair is a
  different prereg.
- **PF2** — any B ≠ 0 with its R PASSED ⇒ **no ship** regardless of the interior bars: the
  above-ground exactness failed on one or both gates — a mechanism defect (and, for the
  localToon leg, a contradiction of §303's shipped [0,0] claim, which would be a finding of
  its own). Record WHICH shot and WHICH uniform moved.
- **PF3** — BG/VB/V4 out ⇒ capture **VOID**; diagnose from readbacks, archive
  (`tombdim21-void-runN`), re-run.
- **PF4** — any R ≠ 0 ⇒ that shot's rows VOID (within-boot sag would be a NEW finding — name
  it from ordinals/timestamps before any re-run).
- **PF5** — runner killed mid-boot ⇒ nothing installed, nothing to restore; archive the
  out-dir, relaunch.
- **PF6** — launch pins fail (dirty src, flipped default on either knob, missing shader gate,
  roster drift) ⇒ abort unscored.
- **PF7** — out-dir exists non-empty ⇒ abort; archive; relaunch.

## 8. §17 look-change declaration and the LOOK gate (binding)

**Intended change, `interior` only.** The even lavender/tan wash drops away; the six sconce
pools become the room's exposure and the vault above goes deep and cool; the sarcophagus and
its gold plinth, lit by pools rather than by the sealed-out sun, stop being darker than the
wall behind them and become the frame's focal. Every other canonical frame is bit-identical
(B bars). Torch flames, bloom and emissive are untouched by both levers.

Crops, `off` vs the candidate: full frame at 1×; POOL+CTRL band [80, 400, 1200, 710] at 2×;
SARC/GOLD [560, 80, 880, 340] at 2×; VAULT [560, 0, 900, 120] at 2×.

**The gate, in one line: "torch pools falling into violet darkness with the gold sarcophagus
as the single bright read."** Scored in two parts, because only one of them is a thing these
two knobs can move:

- **LOOK-A (binding, ship-blocking).** The pools must fall into a darkness that stays
  cool/violet, and the sarcophagus must read as the FOCAL — clearly brighter and warmer than
  the vault field around it, the place the eye goes before the far wall.
- **LOOK-B (reported, NOT ship-blocking, registered as unreachable here — §9).** "The single
  brightest non-flame object in frame." The alabaster jars keep that title at every dose.

**Named look failures — any one is NO-SHIP:**
1. **MURKY** — the room reads as a uniform warm/orange haze with no cool anywhere. This is the
   measured direction of travel: the parent's 0.15 arm (`gradetrio1/interior.bko.png`, the
   calibration image for this judgement) is a red-orange cave whose cool population has
   collapsed to 14.9%. Dark-and-focal is the deliverable; monochrome-warm is a failure.
2. **BLOWN POOL CORES** — the pool centres clip to flat white/yellow plates (the 1.6 cap
   whitens per-channel by design); the raise has gone past the picture.
3. **LEAK** — at the higher gain, pool light visibly passing through piers (point lights cast
   no shadows here — declared in §303) reads as a bug rather than as bounce.
4. **"Props glow against dead walls"** — the parent's unpatched-material risk: anything lit by
   scene lights rather than by `uAmbIntensity` does not dim and would float.
5. The tomb reading as a cave with no legible walls (D1's 0.30 floor is the numeric guard;
   the eye is the binding one).

## 9. The hierarchy claim this seal does NOT make, registered before the capture

r12: *"the gold sarcophagus is dull olive-teal pixel mush; the jars outshine the treasure."*
**Prediction, registered now: no dose of this pair inverts that, and a pool raise widens the
gap it is asked to close.** Grounds, measured on the parent's frames: under the ambient dim
the jars retained more than the gold (L ratios 0.786 / 0.821 / 0.753 for the three jar
clusters vs 0.717 for GOLD) — i.e. **the jars are MORE pool-lit than the gold** (27–42% vs
26%), so multiplying the pool leg lifts them faster. At `off` JARS/GOLD is 1.71; the model
puts every paired arm at 1.75–1.87.

The cause is material, not light: the gilding takes the pool through a 0.20 diffuse
discipline before the metal reduction, no torch specular reaches it (the pools are point
lights; the toon spec is keyed to the sun that this room seals out), and the jars' albedo is
cream. **Routed:** a MATERIAL seal on the sarcophagus gold (spec/metal response to local
lights, or the albedo itself) — the natural sibling of the FX seal on the torches themselves
(r12's "naked glowing bulbs"). H2 bars this seal from making the inversion worse; LOOK-B
reports it; neither pretends the lighting pair fixed it. Recording this BEFORE the lock is
spent is the point: a bar aimed at a claim the mechanism cannot reach is a mis-aimed bar, and
this project has paid for that three times (§141.1).

## 10. Registered forecast (ledger entering 6/19)

**SHIP at `p30` (tombAmb 0.30 × localToon 6.0)** on the bars, with the LOOK gate as the real
uncertainty. Grounds: the pool leg's response is LINEAR in `uLocalToon` in the shader up to a
cap whose saturation is MEASURED (§303's KO1: +24.3 L @2.5, +39.8 @6.0 on this exact rect and
camera, σ = 0.79), the ambient leg's response is measured at two doses, and the composition of
the two reproduces the parent's unfitted third arm to 3.2 L worst. The protection bars rest on
two independent arithmetic identities (weight exactly 0; emitter gate exactly ×0.0), each
already proven [0,0] same-boot in its own seal (§303, §307).

Honest uncertainties, named: **(a) W2 is the coin-flip** — killing the cool ambient hands the
residue to warm torchlight, measured as R−B(FAR) −14.7 → −5.6 → +3.3 across the parent's
doses; VAULT should be immune (~0% pool) but the 2.4× raise pushes the other way, and if it
crosses −8 the seal NO-SHIPs on exactly the right statistic. **(b) The LOOK risk is the warm
takeover**, and it is asymmetric between the arms: `p30` maximises darkness and therefore the
warm share, `p45` keeps more cool ambient and is likelier to read as tension rather than as
murk. If `p30` passes its bars but reads monochrome-warm while `p45` reads dark-and-focal,
**that is the registered finding and `p45` ships** — the preference order decides only among
arms that pass, and the LOOK gate is binding over both. **(c)** The cap could eat the raise
(KO fails, POOL barely moves between `p30` and `p30hi`); then the co-lever is exhausted at
2.5–6.0 and the finding routes to the pool's radius/count, not its gain. **(d)** `p30hi`'s σ
is extrapolated past the record; it is a dose arm for that reason and cannot ship.

## 11. SCORING RECIPE (for the coordinator; exact commands, every branch)

The runner is DETACHED (`tools/launch.sh`, §298.3) and waits in the FIFO behind other lanes.
Do not wait on it interactively; do not relaunch it because it "looks stuck" — check the lock.

1. **Is it done?**
   `tail -5 /home/user/Demo/progress/records/logs/tombdim2-run1.log` — a completed run ends
   `DONE. Score with:` + the scorer path. `ABORT`/`VOID` lines mean PF5/PF6/PF7 fired; the log
   says which. Liveness: `pgrep -f 'tombdim[2].mjs'` or check `/tmp/sands-of-ra/tombdim2.pid`
   against `/proc`. Queue/lock state: `ls /tmp/sands-of-ra/queue/` and
   `cat /tmp/sands-of-ra/capture.lock`.
2. **If the runner died mid-boot** (PF5): nothing was installed — verify `git status` shows
   `src/` clean (a dirty tree is ANOTHER lane's residue: report, do not touch), archive the
   out-dir (`mv progress/records/tombdim21 progress/records/tombdim21-void-run1`) and
   relaunch:
   `bash tools/launch.sh progress/records/tombdim2/tombdim2.mjs /home/user/Demo/progress/records/logs/tombdim2-run2.log /tmp/sands-of-ra/tombdim2.pid`
3. **Score:** `cd /home/user/Demo && node progress/records/tombdim2/tombdim2-score.mjs`
   (exit 0 = some candidate arm passed every bar; the last lines name it). Keep the output:
   `... | tee progress/records/logs/tombdim2-score-run1.log`.
4. **LOOK gate (binding, before any ship write):** open `progress/records/tombdim21/
   interior.off.png` vs `interior.<arm>.png` at §8's crops (`node tools/crop.mjs <in> <out> x
   y w h 2`), with `gradetrio1/interior.bko.png` open beside them as the calibration image for
   "murky". Record the verdict prose in RESULT-tombdim2.md — including LOOK-B's reported
   answer (are the jars still brighter than the gold?).
5. **Outcome branches** (write RESULT-tombdim2.md + a KNOWN_ISSUES § in EVERY branch):
   - **PASS + LOOK pass (ship).** §296 first: confirm `/tmp/sands-of-ra/capture.lock` absent
     AND `/tmp/sands-of-ra/queue/` empty immediately before touching src. Then in ONE commit
     citing RESULT-tombdim2, with `A` = the shipping arm's tombAmb and `K` its localToon
     (`p30` → 0.30 / 6.0; `p45` → 0.45 / 4.0):
     1. `src/render/ToonMaterial.js`: `TUNE.tombAmb` `1.0` → `A`; in the TUNE comment replace
        "Ships below 1.0 only on PREREG-tombdim's PASS; 1.0 is the registered fallback
        (mechanism stays, dim off)." with "SHIPPED at `A` per RESULT-tombdim2.md — the PAIRED
        seal: this dim ships ONLY with TUNE.localToon `K` (Lighting.js), because an
        ambient-only dim takes the pools down with it (§307). Above-ground protection [0,0]
        ×15 same-boot; absolute POOL/SARC holds, focal and warm/cool bars green."
     2. `src/render/Lighting.js`: `TUNE.localToon` `2.5` → `K`; APPEND to the SHIPPED
        paragraph: "Re-gained to `K` per RESULT-tombdim2.md — the paired interior seal
        (TUNE.tombAmb `A`). The MECHANISM is untouched (same term, same y < -0.5 gate, same
        1.6 cap, same publish path); only this gain moves, so the tomb's pools pay back the
        exposure the ambient dim removes. §303's own dose arm measured this gain (+39.8 L at
        6.0 vs +24.3 at 2.5)."
     3. `tests/tombdim.test.mjs`: first pin → `assert.equal(TUNE.tombAmb, A, 'shipped by
        RESULT-tombdim2 — a later seal moves this only with its own RESULT cited')`; in "at
        1.0 the gate is untaken" construct `new Shading({ debug: { tombAmb: 1.0 }, ... })`
        where it relied on the default (line 32); the null-falls-back assertion (line 93)
        becomes `0.586 * A`.
     4. `tests/torchlight.test.mjs`: `assert.equal(L.TUNE.localToon, K, ...)` with
        RESULT-tombdim2 cited alongside RESULT-torchlight3 (line 111); the publish assertions
        at lines 116 and 125 become `K`; change the override poke at line 120 from `6.0` to
        `2.5` if `K == 6.0`, so the "debug overrides TUNE" test still pokes a DIFFERENT value
        (a poke equal to the TUNE value proves nothing).
     Run `node --test "tests/*.test.mjs"` (full suite green — 506 at seal time) before the
     push. Push `git push -u origin claude/sly-cooper-ancient-egypt-0koo0u`.
   - **PF1** (no candidate passes): no ship; both TUNE values stay; record which bar failed on
     which arm. A D2/D3 failure on BOTH arms means the co-lever cannot pay the ambient back
     and the finding is "the pool gain is exhausted — route to pool radius/count/placement".
     A W2 failure is the murk finding: "the tomb's residue is torch-warm; violet darkness
     needs a cool source, which §300 forbids adding — route to the SKY/enclosure side."
   - **PF2** (any B ≠ 0 with its R PASSED): no ship; mechanism defect; say which uniform moved
     (VB prints them) and whether it was the tombAmb leg or the localToon leg.
   - **PF3** (BG/VB/V4): VOID — diagnose from readbacks, archive, re-run.
   - **PF4** (any R ≠ 0): affected rows VOID — name the mechanism from ordinals/timestamps
     before re-running.
   - **LOOK failure with bars green:** NO-SHIP, and say WHICH named failure of §8 fired and on
     which arm; if `p30` fails MURKY and `p45` passes, `p45` ships (§10 b).
6. Frames and manifest stay in `progress/records/tombdim21/` (archive as
   `tombdim21-void-runN/` on any VOID before relaunching — PF7 enforces this).

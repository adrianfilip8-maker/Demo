# PREREG-atmowire — connect the published atmosphere curve to world pixels (the fxcluster-E routed fix), with the fog target dose it is now proven to need

**Owner:** SHADING (`src/render/ToonMaterial.js`, `src/render/shaders/toon.glsl.js`; consumer
side). Publisher line lives in `src/render/Sky.js` (**SKY's file**) and the fog target in
`src/render/Atmosphere.js` (**FX's file**) — this seal binds the design, the coordinator
assigns those editors (the PREREG-fxcluster Guard.js pattern, verbatim).
**Date sealed:** 2026-08-05. **Status:** REGISTERED, offline only — the capture queues after
the current lock chain; no lock taken, no `src/**` touched by this task. Every number below
is printed by the committed instrument `fxcluster-diag.mjs section W` (extended, not forked,
per the dispatch) from committed source at tree `3be168ae28832f69` and committed frames, or
quoted from committed records.

**The finding under repair** (RESULT-fxcluster E, routed §4-R2): dunes' pyramid landmark is
isoluminant with its sky (Q-E1 base 1.7 vs the reference class 21.4); the FX-side fogColor
anchor alone moved 2.3 of the needed +8 (NO SHIP), "the dead `setAtmosphere()` side-door
wiring is the real fix." CRITIC-sbs2 holds the loss ("dunes ink/planes" family; the landmark
edge under the sky's own noise floor, fxcluster E4).

---

## 1. Diagnosis at the current tree (section W, run 2026-08-05)

**W1 — the wiring gap, asserted from source (not quoted from an older record):**
`setAtmosphere()` call sites in `src/**` excluding its own definition and comments: **0** —
the publisher is missing. The live path is the fallback side-door:
`uHazeDensity = max(scene.fog.density × 2.6, 0.004)` (ToonMaterial.js:1645) with
falloff/base/start/gain **hardcoded** at TUNE 0.055 / 0.0 / 26 / 1.30 (ToonMaterial.js:579-583),
fed by Sky's fallback `FogExp2` (Sky.js:582-585) carrying only Atmosphere's `fog.color` +
`fog.density`. `_fogSynced = true` has exactly **one** writer (`setAtmosphere`) — so a live
`setAtmosphere` poke is durable for the boot, which is what makes the capture emulation exact.

**Connect, not retire — the code's own design intent, four exhibits (all asserted present):**
Sky.js: *"Fallback fog only. SHADING is supposed to apply `sky.fogParams` in-shader"*;
ToonMaterial `_refreshHazeSun`: *"a floor under a missing publisher, not a replacement for
one"*; ToonMaterial update(): *"before it learns about setAtmosphere()"*; TUNE banner:
*"atmosphere (SKY overrides these)"* — plus Atmosphere's `aerialBlend` docstring (*"the exact
curve SHADING/POSTFX must reproduce from `sky.fogParams`"*) and ATMOSPHERE_GLSL's seamless-
horizon contract. Every comment names the published path as the contract and the side-door as
a stopgap. The retire option is unsupported by anything in the tree.

**W2 — the shape defect is two-sided** (blends at dunes staging, tod 0.83 → el 15, k 0.718;
applied slyHaze vs published applyAerial):

| point | dist | applied | published |
|---|---|---|---|
| pyramid apex | 338 m | 0.254 | 0.647 |
| pyramid mid | 328 m | 0.440 | 0.726 |
| complex90 | 107 m | 0.442 | 0.208 |
| ground60 | 66 m | 0.282 | 0.090 |
| near26 | 29 m | 0.002 | 0.017 |

The side-door **under-hazes the high far landmark ~2.5×** (Beer-linear with an 18 m scale
height starves altitude) **and over-hazes the low mid-ground ~2×** — both halves of "curve
shape". **W3 — parameter-mapping is refuted**: the best slyHaze parameterization of the
published curve (falloff 1/54.6, density′ solved at the apex) leaves residuals up to
**+0.31 blend** at complex90 — the linear-vs-quadratic exponent is structural. **The
connection must adopt the published curve in the shader**, not feed new numbers to the old
shape.

**W4/W5 — measured anchors and the instrument finding.** Base is stable across committed
dunes frames: edge-convention sky−pyr **1.7 to the digit on all three trees**
(cand1 / sbs2 / fxc1); clean-rect Q-W1 **3.7** on the two newest trees (sbs2 16a3817+dirty,
fxc1) and 4.6 on the pre-skynoise cand1 tree (the deck fix moved skyLeft 162.7 → 161.8 —
stated, and covered by the base gate). The fxc1 ×0.75-fogColor pair gives the empirical display transfer:
pyrInterior −5.90 L and complex −7.92 L → slopes **124 / 113 L per unit linear (b·h)** —
consistent at two sites; dome invariance under the same arm ≤ 0.08 L on three pure-sky rects
(the dome does not consume `fog.color`, proven on pixels). **Instrument finding, recorded:**
Q-E1's edge-relative flank sampler read the ×0.75 arm at +2.3 while the clean-rect pair reads
**+11.8** — the flank "sky" contained hazed world pixels that co-moved with the treatment.
*A comparator must not consume the treatment.* This seal's decisive quantity is therefore the
**fixed-rect pair** (CRITIC-sbs2's own convention): **Q-W1 = medL(skyLeft 130,30,280,90) −
medL(pyrInterior 470,30,650,90)**, with the edge-convention number carried as continuity only.
(The naive approx-AgX inversion model is separately RECORDED AS REFUTED in section W — it
failed its own §13 calibration by ~50 L; nothing below rests on it.)

**W5 dose table** (connected blends; empirical slope 118 L/lin; extrapolation to 4–8× the
calibration dose is the stated hazard — hence bracket arms and ordering gates, not points):

| fogColor scale s | predicted Q-W1 | predicted Δcomplex |
|---|---|---|
| 1.00 (wire-only) | **−13.5** (pyramid LIFTS above sky) | −21 L |
| 0.55 | +4.4 | −27 L |
| 0.40 | **+10.4** | −28 L |
| 0.30 | +14.4 | −30 L |

**The two levers are individually insufficient and jointly sufficient:** the fog target
(fogColor-family, display ~207–213) sits ~55 L above the sky the dome renders beside the
pyramid, so more blend alone lifts the landform the wrong way (s=1.00 row); more darkening
alone at the old blend measured +2.3 on Q-E1's own gate (RESULT E). Curve × target,
multiplicatively — RESULT-fxcluster E's closing sentence, now with the arithmetic.

## 2. The candidate

- **C1 (SHADING; the shader seam — in-ticket pre-edit, zero look change, default OFF):**
  `toon.glsl.js` slyHaze/slyHazeColor gain a published-curve branch behind a new uniform
  `uAtmoWire` (0.0 shipped = bit-identical; the fxcluster seam discipline, proven by base
  arms). Wired form = ATMOSPHERE_GLSL's applyAerial exactly:
  `h = exp(−max(worldY,0)/uHazeHeightFalloff); blend = 1−exp(−(d·uHazeDensity·mix(0.55,1,h))²)`;
  haze colour = `uHaze + uHazeTint·pow(sunAmt,5)·uHazeInscatter` (replaces the pole-mix and
  the ×1.30 gain when wired). `ToonMaterial.setAtmosphere` accepts `{heightFalloff,
  inscatter, tint}` (stored to new uniforms; inert while `uAtmoWire` is 0).
- **C2 (publisher; SKY's file, editor assigned by coordinator):** one call —
  `engine.get('shading')?.setAtmosphere({color, density, heightFalloff, inscatter, tint,
  gain: 1.0})` from Sky's refresh path. **The capture does not need it**: `setAtmosphere` is
  live-pokeable and durable (single `_fogSynced` writer), so arms poke the exact values the
  publisher would send. C2 ships only on PASS.
- **C3 (the fog target dose; FX's file, editor assigned by coordinator — E's own lever
  re-armed at the connected leverage):** `fogColor`/`fogTint` day-family × s, bracketed
  s ∈ {0.55, 0.40} in-capture (pokes, no anchor edit until ship). Ship value = whichever
  bracket arm lands Q-W1 in band (P-A1 if neither).

**Scope note owed to banda2's routing:** the atmosphere wiring and the interior warm-share
deficit do **not** share a mechanism — both curves are ≈0 under 30 m (near26: 0.002/0.017)
and the interior framings measure at 2–15 m; interior warm share is lit-area coverage
(torch/FX + enclosure/LIGHTING), exactly as RESULT-banda2 routed it. This seal claims
exterior far-field only; no stretch.

## 3. Registered quantities — WBANDS (to be duplicated verbatim in the scorer extension
before capture; conventions: medL on fixed rects, Rec.709 0–255, ΣRGB ≥ 4 for diff counts)

**Base gates (VOID not FAIL):** Q-W1 base ∈ [2.5, 5.0] (measured 3.7 newest trees / 4.6
pre-skynoise); complex medL
∈ [100, 120] (109.8); nearGround medL ∈ [70, 85] (77.5); skyLeft medL ∈ [156, 168] (161.8).
**Noise gate** (fxcluster-A's lesson, measured in-boot): |Q-W1(base2) − Q-W1(base)| ≤ 1.0,
else UNSCOREABLE.

| id | arm | quantity | band |
|---|---|---|---|
| Q-W1 | **CT40** (wire + s 0.40) | skyLeft − pyrInterior medL | **[+8, +22]** (predicted 10.4; ref class 21.4 = target class, not gate) |
| Q-W1b | CT55 (wire + s 0.55) | same | [+1, +9] (bracket point) |
| Q-ORD | — | ordering base ≤ CT55 < CT40 on Q-W1 | monotone dose-response holds |
| Q-DIR | W (wire-only, s 1.0) | Q-W1 | **< +1.0** (separation collapses/inverts — the diagnostic that proves the curve carries and isolates the target defect; predicted −13.5) |
| Q-CPX | every wired arm | Δ complex medL vs base | corridor **[−35, −12]** + floor: complex medL ≥ 70 (the designed de-haze toward published 0.208 — a declared look change, not collateral) |
| Q-NEAR | every wired arm | Δ nearGround medL | \|Δ\| ≤ 4.0 |
| Q-DOME | every arm | Δ on skyTopLeft/skyTopRight/skyLeft | \|Δ\| ≤ 1.0 each (the world-only premise, on pixels) |
| Q-SEAM | CT arms | horizon-line step (world strip vs dome strip at the skyline, rows ±8 px) | REPORTED with crop — honesty row; if ugly, the dome `haze` anchor is FX's to co-move |
| Q-REG | chunk-2 hero + night | CT40 vs base far-field ΔmedL rows | REPORTED corridors (declared §17 radius; night's own anchors drive its values) |
| P-F4 | every chunk | restore vs base differing px | **[0, 0]** (restore = `uAtmoWire 0` + re-poke recorded boot values of every haze uniform; procedure in the runner, values logged per arm) |
| KB-dense | wire + s 0.40 + density ×3 | must breach Q-CPX floor or Q-NEAR | reads as its own failure, else UNSCOREABLE |

## 4. P-falsifiers — revert, do not defend

- **P-A1** CT40 below +8 with Q-ORD intact ⇒ dose insufficient at the wired blend: no ship;
  the measured two-point response resolves s′ for ONE successor re-seal (no in-run retune).
- **P-A2** Q-DIR fails (wire-only does NOT collapse separation) ⇒ the curve port is wrong
  somewhere upstream — candidate VOID, diagnosis re-opens at section W.
- **P-A3** KB-dense passes the gates it must breach ⇒ UNSCOREABLE.
- **P-A4** restore ≠ base ⇒ every arm number in that boot void.
- **P-A5** Q-DOME breach on any arm ⇒ the world-only premise broke ⇒ capture VOID,
  re-diagnose (something besides world pixels consumes these uniforms).
- **P-A6** noise gate breach ⇒ UNSCOREABLE (fxcluster-A precedent).

## 5. §17 look-change declaration

Deliberate and declared: every exterior day shot's **mid-ground de-hazes** (complex −12..−35
display L toward the published design's own blend table) and the **far landmark separates
below its sky** (the decisive quantity); birds already run the published curve and will now
**match** the world exactly (the seamless-horizon contract fulfilled, not violated); Water
shares `fog.color` and darkens with the dose. Night's far field follows the same wiring at
night-anchor values — captured as a REPORTED regression row before any ship. Near field
(≤ 30 m) is unchanged by both curves (≤ 0.02 blend). Ships only through this A/B with a
KNOWN_ISSUES entry quoting this file; the fogColor/fogTint anchor edit ships in FX's file by
FX's editor, the Sky publisher line in SKY's — one coordinated commit, or none.

## 6. Capture plan (queued after the current lock chain; §164 chunked; runner to be committed
as `progress/records/atmowire1.mjs` from the banda2.mjs template before any boot)

- **Pre-edit** (one ticketed commit before chunk 1, the fxcluster §1 seam pattern): C1's
  debug-gated shader branch + setAtmosphere param extension, default bit-identical, proven by
  chunk 1's base arms (P-F4 discipline).
- **Chunk 1** `dunes` (one boot): base → base2 → W → CT55 → CT40 → KB-dense → restore
  (7 frames + per-arm readback of every haze uniform + `_fogSynced` + `uAtmoWire`).
- **Chunk 2** `hero` + `night` (one boot each if lock-tight): base → CT40 → restore
  (Q-REG rows).
- Scorer: section W gains a `score` path (env-overridable frame dirs, the A–E pattern) with
  the WBANDS table verbatim BEFORE capture; scoring at first wake after DONE (§163.2) into
  `RESULT-atmowire.md`.

## 7. Files of this seal (coordinator sweep list — no git run by this task)

- `progress/records/fxcluster-diag.mjs` — **extended** with section W (atmowire diagnosis:
  wiring asserts, curve tables, mapping refutation, empirical transfer, dose table; opt-in
  `W` argument, A–E untouched); output lands in `fxcluster-diag-out.json` as before.
- `progress/records/PREREG-atmowire.md` — this file.
- (later, per the plan above and NOT this task: the seam pre-edit, `atmowire1.mjs`, frames
  under `progress/records/atmowire1/`, `RESULT-atmowire.md`.)
- Scratchpad only: none beyond prior tasks' (the localizer crops from banda2 remain
  scratchpad-only).

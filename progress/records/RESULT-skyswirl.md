# RESULT-skyswirl — skyswirl1 scored against PREREG-skyswirl.md

**STATUS: SCORED, 2026-08-05. Verdict: the candidate `uGraze = (0.15, 0.10, 0.30)` MEETS
every registered gate — base gates, P1/P2/P3 excess and total bands, P4 PD9 orderings,
P5 courtyard 0-px null, P6 hero regression, P7 vocabulary (both zooms, veil clause), with
all four restore controls bit-identical and the KB arm earning its registered poster
failure. No P-falsifier fired. The src term was REVERTED inside the lock hold
(hash-verified); the shipped tree carries no uGraze. The ship decision on re-applying
the diff with lift 0.15 is the coordinator's.**

Owner: SKY. Prereg: `PREREG-skyswirl.md` (authoritative; nothing edited after capture).
Runner: `progress/records/skyswirl1.mjs` — banda2 template with ONE lock hold for the
whole run (its own acquire + inlined boots, because the src edit below must exist at BOOT
and only inside the ticket), detached via `tools/launch.sh` (pid 31114, ppid 1 verified).
Scored with `node progress/records/skynoise-diag.mjs swirlscore progress/records/skyswirl1`.

## Provenance and stamps

- **The sealed src edit was applied and reverted INSIDE the single lock hold**
  (20:15:12 → 20:49:09, ≈34 min): pre-edit tree `3be168ae28832f69` → edited
  `7a4630875cac6e36` (STABLE before/after BOTH chunks) → reverted, `treeHash ==
  pre-edit hash (verified)` in the run log; pristine copy at `skyswirl1/Sky.js.pre-edit`.
  Coordinator independently verified Sky.js byte-clean post-revert (§174 dispatch/commit
  0c0f535). The drift guard of `skynoise-diag.mjs` passed ON the edited tree mid-run
  (R4′ check: the uGraze lines add, they do not touch parsed patterns).
- **Lever probes, both boots:** `uGraze [0, 0.1, 0.3]` (the inert default) live at boot,
  and the SHIPPED decks live exactly — scale (0.000105, 0.000138, 0.000105), soft
  (0.36, 0.38, 0.40), warp (0.55, 0.85, 1.25). Every poke's readback matched its request
  (`applied ok`, 12/12 arms; `readback-A/B.json`).
- **uTime frozen within each shot** across ALL arms (dunes 0.563, night 0.847,
  courtyard 0.559, hero 0.842) — the dt=0 discipline that makes restore identity and
  the frozen-FX-petal pairing meaningful. Covers matched `evalAtmosphere` per tod.
- Renderer: SwiftShader/ANGLE Vulkan (same class as all baselines). 1280×720, q=high.
- **Boot-to-boot, cross-tree stationarity:** base arms reproduce the committed sbs2
  frames (tree 16a3817+dirty, five commits back) to 0.00–0.02 hf: dunes 4.66 vs 4.68,
  night 3.83 vs 3.83, hero 3.78 vs 3.78 — different boots, different uTime, different
  tree, same sky statistics. The base gates arbitrated inertness and passed.

## Score table (hf = hf_x + hf_y; excess = arm − same-boot kb; registered rects, unmasked
except hero mask<60)

| shot / arm | hf | PD9 | sd | registered gate | verdict |
|---|---|---|---|---|---|
| dunes base | 4.66 | 2.83 | 6.36 | base ∈ [4.2, 5.2]; base−kb ≥ 0.55 (=0.93) | **PASS** (known-bad reproduced) |
| dunes cand | **4.05** | 1.53 | 4.87 | P1 excess 0.32 ∈ [0.08, 0.55]; P2 drop 0.61 ≥ 0.35 | **PASS** |
| dunes kb | 3.73 | 0.31 | 3.73 | kb ∈ [3.4, 4.2]; PD9 ratio 0.11 ≤ 0.6; strict order 0.31<1.53<2.83 | **PASS** (poster floor earned) |
| dunes restore | 4.66 | 2.83 | 6.36 | P-F4: 0 px vs base at ΣRGB≥4 | **PASS — bit-identical** |
| night base | 3.83 | 5.81 | 8.24 | base ∈ [3.3, 4.4]; base−kb ≥ 0.80 (=2.05) | **PASS** |
| night cand | **1.87** | 1.59 | 2.56 | P3 excess 0.08 ∈ [0.00, 0.45]; total 0.49 ≤ 0.75 | **PASS** |
| night kb | 1.78 | 1.57 | 2.43 | kb ∈ [1.4, 2.6]; PD9 ratio 0.27 ≤ 0.6 | **PASS** |
| night restore | 3.83 | 5.81 | 8.24 | 0 px vs base | **PASS — bit-identical** |
| courtyard cand vs base | — | — | — | **P5: 0 differing px INSIDE (850,0,1150,55) at ΣRGB≥4** | **PASS — the bit-exact scope claim holds in frame** |
| courtyard restore | — | — | — | 0 px vs base | **PASS** |
| hero base / cand | 3.78 / 3.78 | — | — | base ∈ [3.5, 4.1]; cand ∈ [3.2, 4.1] | **PASS** (no regression; FXAA-floored as predicted) |

P-F5 non-sky proxy (y ≥ 400): **0 differing px** cand-vs-base on dunes AND night — the
poke changed dome pixels only.

## P7 — the looked-at frames (zoom stated; montages base|cand|kb from the capture PNGs)

- **dunes cand at 1× (wide 760–1280 × 0–200) and 2× (the scored band):** the liquid
  filament field of the base arm is GONE; the band reads as a warm-to-blue haze gradient
  with sparse soft wisps; the pyramid separates chromatically as before. None of the
  REJECT vocabulary (**liquid / marble / water / static**) applies at either zoom.
  Distinct from kb: cand keeps faint wisp content the kb arm lacks entirely.
- **dunes kb at 1×:** a featureless poster gradient — **the registered KB failure read,
  earned** (this is the §2.3 fail state the arm exists to demonstrate; P-F7 satisfied
  on the eyeball channel as well as in the numbers).
- **night cand at 1× (wide, boost 2.0 stated) and 2× (scored band, boost 2.4):** the
  swirl band is a clean night gradient with stars; **"oily"/"watery" does not describe
  any part of either zoom** — the sbs2 blind-read word no longer applies. The upper sky
  (rows above the band, > 13.5° elevation) keeps REDUCED soft veils, and the **moon-band
  veils remain visible around the moon** (left staging, 1×, boost 1.6) — the P7 veil
  clause is met; their thinning is the declared ~10–30%.
- FX petals (pale motes) are present and IDENTICAL across arms (frozen uTime; restore
  bit-identity is the proof) — they cancel in every paired comparison as designed.

## P-F8 seam scan

Per-column gradient probe over the cand skies: every sustained spike resolves to
geometry — dunes x899 (pylon edge), night x719/x856-857 (ring cable / obelisk edge),
courtyard x595-596 (obelisk — the SAME landmark the predecessor's scan logged), hero
x214-216/x428-431 (pylons). **No sky-interior discontinuity.** R1 (the non-tiling
lattice) did not surface at these boots' uTime; the risk stays live for long-lived boots
and stays routed as its own owed term fix.

## P-falsifier checklist

- P-F1 (excess band tops): **not fired** — 0.32 / 0.08 inside.
- P-F2 (dunes poster while cand): **not fired** — excess floor 0.32 ≥ 0.08 and the 1×
  read keeps wisps kb lacks.
- P-F3 (base gates): **not fired** — 4.66 / 3.83 inside; shipped decks verified live.
- P-F4 (restore identity): **clean on all four shots** — 0 px at ΣRGB≥4.
- P-F5 (non-sky coupling): **clean** — 0 px, both scored shots.
- P-F6 (courtyard null): **clean** — 0 px inside the rect; the term is scoped exactly
  as designed.
- P-F7 (KB separation): **not fired** — base−kb 0.93/2.05 over floors, kb reads poster.
- P-F8 (seam): **did not surface** (probe + eyeball above).

## Findings recorded for reuse

1. **The excess-basis sim calibration held:** frame/sim ratios this capture — dunes
   base-excess 0.93/1.46 = 0.64, cand-excess 0.32/0.38 = 0.84; night 2.05/2.64 = 0.78,
   0.08/0.09 ≈ 0.89 — all inside the seal's stated 0.5–1.0, so no recalibration is
   mandated (R3′ satisfied; quote these for the next sky candidate).
2. **A uniform-gated shader term with a smoothstep clamp gives a REGISTERABLE bit-exact
   null** on any surface whose domain sits past the clamp — courtyard measured 0 px.
   That is a stronger scope proof than any statistical gate and it costs one uniform.
   Pattern: default-inert term + P-F6-style null + base-gate stationarity.
3. **Sky statistics are stable across five commits of non-sky work** (16a3817+dirty →
   3be168ae28832f69): 0.00–0.02 hf on three shots. A sky base gate can be sealed against
   committed frames without demanding a same-tree recapture.
4. The KB-as-in-band-floor design (over-corrected arm doubling as the paired-excess
   floor) replaced the predecessor's separate flat arm without losing separation — one
   fewer arm per shot, and the floor is itself a registered REJECT state.

## §17 declaration (restated from the seal)

This is a declared look change to every canonical frame's sky below ~17.5° elevation,
shipped (if the coordinator ships it) through this A/B with the base arms as the
before-record. **The shipped tree today carries NO part of it** — the uGraze edit was
reverted inside the hold and hash-verified (`3be168ae28832f69`). To ship: re-apply the
§3 diff of the seal exactly (the runner's EDITS table applies it mechanically;
`skyswirl1/Sky.js.pre-edit` is the pristine reference) and set `TUNE.graze.lift = 0.15`
(dyLo 0.10, dyHi 0.30 unchanged), landing with a KNOWN_ISSUES entry quoting the seal.
Revert path: lift back to 0.0 (visually identical to removal — the term is inert at 0)
or remove the six lines.

## Files

- `progress/records/skyswirl1.mjs` — runner (idempotent per chunk; REVERT recovery mode)
- `progress/records/skyswirl1/` — 14 frames + `readback-A/B.json` + `run.log` +
  `edit-state.json` + `Sky.js.pre-edit`
- `progress/records/RESULT-skyswirl.md` — this file
- `progress/records/PREREG-skyswirl.md`, `progress/records/skynoise-diag.mjs` — unchanged
  since seal; the swirlscore output quoted here is reproducible from them.
- Scratchpad only (never committed): P7 montages (`p7-*.png`), `p7crops.mjs`.

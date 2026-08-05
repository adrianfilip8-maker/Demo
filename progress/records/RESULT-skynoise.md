# RESULT-skynoise — skynoise1 scored against PREREG-skynoise.md

**STATUS: SCORED, 2026-08-05. Verdict: the candidate MEETS every registered primary
(P1/P2/P3 excess bands, P5 totals, P6 hero regression, P7 eyeball) with all four restore
controls bit-identical; P4 (the PD9 structure gates) is UNSCOREABLE under the seal's own
separation clause, and the reason is measured and named below. No P-falsifier commands a
revert. The ship decision on the six TUNE.decks numbers is the coordinator's.**

Owner: SKY. Prereg: `PREREG-skynoise.md` (authoritative; nothing in it was edited after
capture). Runner: `progress/records/skynoise1.mjs`, detached via `tools/launch.sh` (ppid 1
verified), four §164 chunks, each its own boot and lock hold, arms as live pokes with
`step(1, dt=0)` between arms. Scored with
`node progress/records/skynoise-diag.mjs score progress/records/skynoise1`.

## Provenance and stamps

- **src tree at capture: `3e2477e7456b540b` — verified before AND after every chunk, all
  four STABLE.** The repo tree moved AFTER the capture: `Props.js` gained the shipped gold
  hull line (b2cc43a, hullkerb ACCEPT), so these frames PRE-DATE the shipped hull — expect
  architecture (not sky) differences against any future capture. Every comparison in this
  file is within one boot and is unaffected.
- Lever probes: all four boots report shipped `uDeckScale (0.0003, 0.00052, 0.00088)` and
  `uDeckSoft (0.30, 0.16, 0.09)` — exactly the prereg's ship values; every poke's readback
  matched its request (`applied ok`, `readback.json` per chunk); `uCloudCover` originals
  matched `evalAtmosphere` per tod (courtyard 0.59/0.68/0.72 @ 0.76; night 0.67/0.72/0.74
  @ 0.02; dunes 0.593/0.683/0.720 @ 0.83; hero 0.59/0.68/0.72 @ 0.79).
- uTime frozen within each chunk (0.63 / 0.56 / 0.56 / 0.58 across ALL arms of A/B/C/D) —
  the dt=0 discipline held, which is what makes the restore identity meaningful.
- Boot-to-boot stationarity: base-arm values reproduce the committed cand1/gold1 baselines
  to 0.01–0.04 hf (7.90 vs 7.91, 7.35 vs 7.39, 5.63 vs 5.64, hero 3.80 vs 3.80) — different
  boots, different uTime, same statistics.

## Score table (hf = hf_x + hf_y; excess = arm − same-boot flat; registered rects/masks)

| shot / arm | hf | excess | PD9 | sd | registered interval | verdict |
|---|---|---|---|---|---|---|
| courtyard base | 7.90 | 4.10 | 10.80 | 17.16 | base gate ≥ 6.5 | **PASS** (known-bad reproduced) |
| courtyard cand | 4.20 | **0.40** | 6.57 | 10.14 | P1 excess [0.05, 1.30] | **PASS** |
| courtyard flat | 3.80 | ≡0 | 3.20 | 7.69 | flat hf [3.0, 4.4]; PD9 < 1.2 | hf **PASS** / PD9 **≥1.2 → see P4** |
| courtyard restore | 7.90 | — | 10.80 | 17.16 | P-F4: 0 px vs base | **PASS — bit-identical** |
| night base | 7.35 | 5.46 | 5.92 | 10.69 | base gate ≥ 6.2 | **PASS** |
| night cand | 3.66 | **1.77** | 8.30 | 10.87 | P3 excess [0.30, 2.40] | **PASS** |
| night flat | 1.89 | ≡0 | 1.58 | 2.54 | flat hf [1.4, 3.2]; PD9 < 1.2 | hf **PASS** / PD9 **≥1.2 → see P4** |
| night restore | 7.35 | — | 5.92 | 10.69 | 0 px vs base | **PASS — bit-identical** |
| dunes base | 5.63 | 1.08 | 22.14 | 25.51 | base gate ≥ 4.8 | **PASS** |
| dunes cand | 4.96 | **0.41** | 22.22 | 25.61 | P2 excess [0.08, 1.40] | **PASS** |
| dunes flat | 4.55 | ≡0 | 20.36 | 23.94 | flat hf [3.0, 4.4] | **OUT (+0.15)** — floor model wrong on dunes, as the seal's own out-path anticipates; paired excess remains valid |
| dunes restore | 5.63 | — | 22.14 | 25.51 | 0 px vs base | **PASS — bit-identical** |
| hero base | 3.80 | — | 0.96 | 3.30 | (cloudless floor control) | = grain-floor arithmetic 3.76 |
| hero cand | 3.78 | — | 0.82 | 3.24 | P6 total [3.2, 5.0] | **PASS** (no added noise) |
| hero restore | 3.80 | — | 0.96 | 3.30 | 0 px vs base | **PASS — bit-identical** |

Secondary totals (P5): courtyard cand/base **0.53**, night **0.50**, both ≤ 0.62 → **PASS**
(dunes exempt as registered). Non-sky proxy zone (P-F5): **0 differing px** at ΣRGB≥4 for
cand-vs-base on all four shots — the poke changed dome pixels only.

## P4 / flat-PD9 adjudication — UNSCOREABLE, with the mechanism named

The seal's separation clause reads: *"If the flat arm's PD9 lands ≥ 1.2 … the metric is
void ⇒ UNSCOREABLE is the registered outcome."* Flat PD9 measured 3.20 / 1.58 / 20.36 —
≥ 1.2 on all three — so **every PD9-based condition (P4 and the flat absolute threshold) is
UNSCOREABLE by the seal's own clause.** Adjudicated per §141's discipline (report the
instrument's failure, do not re-derive a pass), with the mechanism measured rather than
guessed:

- **Why the absolute thresholds were wrong:** they were calibrated on the sim, whose stated
  fidelity gap (seal §7 R3: no FX/vignette) turns out to carry the whole difference — the
  flat frames visibly contain **FX dust motes and birds over the sky** (specks in
  `courtyard.flat.png`), which plane-detrend + box-9 reads as structure. Sim flat PD9 0.42
  → frame 3.20 is that content.
- **What survives on courtyard/night:** the metric still orders the arms — flat 3.20 < cand
  6.57 < base 10.80 (courtyard); flat 1.58 < base 5.92 < cand 8.30 (night; the candidate
  carrying MORE large-scale structure than the marble is the intended direction). The
  poster arm is the least structured by 2–5×, and reads as a poster on sight (below). The
  relative separation the gate wanted exists; the registered absolute line does not hold it.
- **Dunes PD9 is void by its own controls:** base 22.14 ≈ flat 20.36 ≈ cand 22.22. On this
  rect PD9 measures the horizontal haze gradient's curvature, not sky texture — an
  instrument with no scale on the thing it was pointed at (§141.1, this time in my own
  gate). P-F2 fired by letter on dunes (cand 22.22 > 14), and is adjudicated
  UNSCOREABLE-not-revert because the gate's premise ("above today's marble ⇒ something else
  appeared") is refuted in-boot: the base arm exceeds the cap by the same amount, and
  cand−base ΔPD9 = +0.08. Nothing appeared. The cap constant was calibrated on courtyard's
  baseline (10.85) and never checked against dunes' own (22.14) — recorded as a
  mis-registered constant, not defended.
- **What protects against over-correction with P4 unscoreable:** P7 (below) plus the excess
  band FLOORS, which the candidate clears on all three shots (0.40 ≥ 0.05, 0.41 ≥ 0.08,
  1.77 ≥ 0.30 — the sky still carries deck content; it did not go to poster).

## P7 — the looked-at frames (zoom stated per the crop tool's rule)

- **courtyard cand:** at 1× and 2×, a few large soft cirrus-like wisps on blue; the obelisk
  and colossi sit against readable sky. None of the REJECT vocabulary applies (no "marble",
  no "static", no "cells"). **PASS.** (Side-by-side of the same 120×100 px crop, base vs
  cand, is night-and-day: dense marble static vs clean blue with two wisps.)
- **dunes cand:** at 1×, soft stratus banding near the horizon; the pyramid's stepped
  silhouette — CRITIC's named casualty — now reads against smooth bands. Residual fine
  streaking visible at 2× in the upper blue only. **PASS.**
- **night cand:** at 1×, moonlit veils over deep blue — no longer a ripple field; "reads as
  water" no longer describes the frame. At 2× a liquid swirl persists in the brightest
  band: this is exactly the seal's registered residual R2, and the registered follow-up
  (deck warp 1.25 → ~0.7, its own prereg) remains the named lever. **PASS with residual
  stated.**
- **flat arms:** a featureless gradient poster — §2.3 "no empty sky" fails on sight. The
  REJECT reading the seal registered for this state is confirmed by eyeball even though its
  PD9 line is unscoreable.
- **P-F6 seam scan:** no straight sky-interior discontinuity in any candidate frame —
  eyeballed at 1× across all four skies, plus a per-column gradient probe (isolated
  sustained spikes all resolve to geometry: obelisk x≈595, colossus finial x≈1007, night
  pole x≈856, hero pylon). R1 (the non-tiling lattice) did not surface at these boots'
  uTime 0.56–0.63; the risk stays live for long-lived boots and stays routed as its own
  follow-up term fix.

## P-falsifier checklist

- P-F1 (excess band tops): **not fired** — 0.40/0.41/1.77 all inside.
- P-F2 (structure): fired by letter on dunes' PD9 cap → **adjudicated UNSCOREABLE** (gate
  premise refuted by its own same-boot base control; see P4 section). Not a revert.
- P-F3 (base gates): **not fired** — 7.90/7.35/5.63 over 6.5/6.2/4.8.
- P-F4 (restore identity): **clean on all four chunks** — 0 differing px at ΣRGB≥4.
- P-F5 (non-sky coupling): **clean** — 0 px in the y≥400 proxy zone, all shots.
- P-F6 (seam): **did not surface** (probe + eyeball above).

## Findings recorded for reuse (beyond the verdict)

1. **The paired-excess design worked exactly as intended:** the dither floor (grain
   arithmetic 3.76; hero cloudless base measured 3.80; night FXAA-attenuated floor
   predicted [1.4, 3.2], measured 1.89) cancels out of every scored comparison, and both
   calibration arms landed inside their registered hf bands on courtyard/night.
2. **PD9's absolute thresholds are sim-calibrated and frame-invalid** (FX motes/birds);
   any reuse of PD9 as a gate must calibrate per-shot on real frames, and must not be
   pointed at dunes' rect at all.
3. The sim's candidate predictions vs measured frame excesses: courtyard 0.51→0.40, dunes
   0.82→0.41, night 2.07→1.77 (sim runs hot by 1.2–2×, direction as expected from FXAA).
   Ratios recorded here per seal §7 R3 for the next candidate's bands.

## §17 declaration (restated from the seal)

This is a declared look change to every sky-bearing canonical frame, shipped (if the
coordinator ships it) through this A/B with the base arms as the before-record. The six
numbers are `TUNE.decks` scale (0.00030→0.000105, 0.00052→0.000138, 0.00088→0.000105) and
soft (0.30→0.36, 0.16→0.38, 0.09→0.40) at `src/render/Sky.js:118-120`. No src edit has been
made by SKY; the shipped tree still carries the base values.

## Files

- `progress/records/skynoise1.mjs` — runner (idempotent; re-runnable per chunk)
- `progress/records/skynoise1/{A,B,C,D}/*.png` + `readback.json` — 15 frames + 4 stamps
- `progress/records/RESULT-skynoise.md` — this file
- `progress/records/PREREG-skynoise.md`, `progress/records/skynoise-diag.mjs` — unchanged
  since seal (d3c2fa1/1fe8747); the score output quoted here is reproducible from them.

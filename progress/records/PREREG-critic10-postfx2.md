# PREREG-critic10-postfx2 — the character-bloom gate, resealed with the bars aimed at what the first run measured mis-aimed

Sealed **before** any frame of `shots/c10postfx2/` exists. Same candidate byte-for-byte
(`progress/records/critic10postfx/PostFX.cand.js`, sha cd8ff982…, installed/restored per §186
by the v2 runner), same shots family, new acceptance. RESULT-critic10-postfx is the parent:
its run proved the gate's selectivity (halo ROIs 0.000×4, night 0 px) and failed the seal on
three aim errors (§298.1). **Calibration disclosure: every threshold below was chosen by
reading run 2's frames (closeup 2,555 changed px, mean |ΔL| 5.18, 97.6% darker, brighter side
2.4%; traversal's 318 px on the roof guard; hero's 2 px), then fixed here and applied to a NEW
boot — §13/§141's calibrate-then-accept, stated rather than implied.**

## 1. Capture matrix (one boot, `{dt:0}` everywhere, restore-first arms, per-shot back)

| shot | arms |
|---|---|
| traversal | base · subj1 · back |
| night | base · subj1 · bloomoff · back |
| interior | base · subj1 · bloomoff · back |
| sly-closeup | base · subj1 · back |
| hero | base · subj1 · back |

17 jobs, **no ghost arms, no retries, no world-clock steps** (§298.3's rule: the retry design
is what starved the FIFO; item 2 is closed and routed). Estimated lock hold: 5 stagings
(measured 60–360 s each in run 2) + 17 arms × ~45 s ≈ **25–40 min**, stated per the same rule.
Runner launched detached via `tools/launch.sh` (§298.3's other rule). Treestamp at onLocked.

**Subject-mask dump (the new instrument):** during each shot's `base` arm the runner reads
`postfx.normalRT` back (`readRenderTargetPixels`, RGBA8) and saves `MASK.<shot>.png`: white
where alpha < 128 (the ledger-#31 subject population: skinned draws — Sly, guards, Carmelita),
black elsewhere, Y-flipped to image orientation. The mask is the containment reference. A shot
whose mask is empty while its probe stages the character is **VOID-INSTRUMENT** (prepass not
running or alpha path broken), and a VOID anywhere → NO-SHIP (fail-closed).

## 2. Registered bars (V1–V6; SHIP only if all hold)

- **V1 validity.** Per shot, `back` vs `base` strict **0 px**. Any VOID → NO-SHIP.
- **V2 premise + effect (sly-closeup).** diff(base, subj1) at |ΔL| ≥ 2: **≥ 300 changed px**,
  **mean |ΔL| over the changed population ≥ 3.0** (changed-population statistic per §135.1 —
  no ROI dilution), **darker share ≥ 90%**.
- **V3 containment (all five shots).** Every changed px (|ΔL| ≥ 2) lies within **128 px of a
  subject-mask px** of that shot's own mask. This is B2 re-aimed: the population the gate is
  DOCUMENTED to act on (all skinned draws), not the player's bbox.
- **V4 direction (all five shots).** Brighter-side changed px ≤ **max(32, 5% of that shot's
  changed count)**. This is B3 re-quantified: FXAA re-resolve flips isolated edge pixels both
  ways when their neighbourhood darkens (run 2: 2.4% worst case); a systematic glow increase —
  the harm the bar exists for — fails this count immediately.
- **V5 halo-keep.** Under subj1: night LAMPS [660,0,120,60] and MOON [380,50,60,60], interior
  TORCH-A [1004,175,28,44] and TORCH-B [280,190,28,38]: **|Δ mean L| ≤ 1.0** each vs base.
  Vacuity control: bloomoff must drop ≥ 2 of the 4 ROIs by ≥ 2.0 mean L, else V5 is reported
  vacuous (and the ship blocked — a halo-keep bar that cannot fire protects nothing).
- **V6 the looking.** 3× crops of sly-closeup base vs subj1 over the changed bbox plus a
  ±8×-amplified diff map; the RESULT states what the gate removed and that nothing else moved.

**SHIP on V1–V6** = apply the candidate to `src/render/PostFX.js` with the shipped default
flipped to `bloomSubjectCut: 1.0` (comment updated to cite this seal's verdict), lock checked
clear immediately before the write, full suite green, commit + push. Anything else → NO-SHIP,
and the third seal (if any) must say why the second failed.

## 3. Predictions, held loosely

closeup ~2,000–3,000 changed px, mean 4–6 L, ~97% darker (run 2's values, new boot); traversal
and hero report whatever skinned feed exists at their staging (the roof guard's arms expected
on traversal — now INSIDE the containment reference); night 0 changed px; all four halo ROIs
at |Δ| ≤ 0.01. Report-only: traversal SUBJ-DISPLAY [536,205,42,92] and BALL [572,238,36,36]
deltas, for continuity with the parent RESULT's decomposition.

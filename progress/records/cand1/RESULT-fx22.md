# RESULT — fx22 r4: candidate 1 (backdropGate) scored against PREREG-sandhigh.md Amendment 1, arms D1–D4

**Status: SCORING IN PROGRESS — this file is written incrementally (§163–§164 rollback cadence).
Sections land as arms compute; the VERDICT block at the bottom is the decision.**

Scored by a fresh FX agent (all prior transcripts lost to rollbacks) from committed evidence only.
The sealed scorer `progress/records/cand1/fx22an.mjs` was run **unmodified**; this file reports its
output and applies the registered wording. Per the scorer's own footer: *"This file evaluates; the
RESULT decides, after the crops have been looked at."*

## Provenance

- **Run**: fx22 r4, four chunks per §164.1 (`temple` / `hero+dunes` / `courtyard+night` /
  `interior`), each chunk one boot, every registered comparison within its chunk's boot (pairs share
  the boot; `temple.back` rides the temple chunk). Run logs:
  `progress/records/logs/fx22-r4c{1,2,3,4}.log` — all four end `fx22 DONE`.
- **Tree**: `src/**/*.js` hash at scoring = `3fea650a4d645857e4843149d19e5445f133ac33172a321c128517a87a7a7a57`
  = prelaunch stamp = the registered stamp in `cand1/fx22.treehash.json` (postrun field now filled).
  The tree never moved across the r4 window; §121.4 closed for this run. Head at prelaunch: `47de8f1`,
  0 dirty src files.
- **Evidence scored**: the COMMITTED copies under `progress/records/cand1/frames/` (13 PNGs +
  `fx22.json`, landed across commits 8391e43…efef525). Verified byte-identical (sha256) to the live
  `shots/fx22/` copies, then copied over them so the scorer's fixed paths read committed bytes.
- **Renderer**: SwiftShader (software raster) in all four boots; frame-time cost of the extra
  backdrop pass remains **unmeasured, not estimated** (§148.1).

### Evidence sha256 (committed == live verified before scoring)

| file | sha256 |
|---|---|
| temple.base.png | 221685c77d853f4cc4cf450e0a973a574541167d5d9c1a482fcc1576dc2b3ef3 |
| temple.back.png | 221685c77d853f4cc4cf450e0a973a574541167d5d9c1a482fcc1576dc2b3ef3 (== base, byte-identical) |
| temple.gated.png | 06b58497259d67455f2a8f25911f42e5ee2c362806c60a55a990a8646d3f456b |
| hero.base.png / hero.gated.png | 33d4af14c5d1dcbb3f043bfa2117cca479fe76fe73ca4ff4b48c08e1122826d0 (identical pair) |
| dunes.base.png / dunes.gated.png | bd6c664d64da04ecfc3c46d8932c328cc40a400791b2b77eddf474ab6c8e6c19 (identical pair) |
| courtyard.base.png | a59ed531ea4452669c0a64d9595804d9ae64f409c6f89599e23827d4fa2b2338 |
| courtyard.gated.png | fd9327ea7b24e084691992eb209dbf4557be8355874cee5f7d3613002fc371e2 |
| night.base.png | cab03f7b6bafe71f01c7ea3f2b2d4d5b21aa30a9f9c016451d11106e163a6420 |
| night.gated.png | 31e89b0b1189860aed9492bac6e7fa5d5860c025d7b16524a5991e7c8967253f |
| interior.base.png | 9d720634a6ff25161a170aecf6ee9f0ad1732129fb82b3ead7b1646885bcec97 |
| interior.gated.png | ae07095f70e51de2ae93ac104777908a25ed0c9817d5a2ba0244d8bffd2a0f99 |
| fx22.json | d62a735116676d3734eb4aae9b08118d1f5d6848eb8ee1571f2171f650ebcd68 |

Scorer output preserved verbatim at `progress/records/logs/fx22an-r4.log`.

---

## Arm stamps (from each job's probe)

All 13 jobs: `lumaMax=60 rbMax=0.5 soft=8/0.08 min=0`, `sandHigh live=900`, `backdropRT 320x180
bound=true` in **both** arms (the particle-free backdrop pass runs in base arms too — the only
difference between arms is the one `uGate.x` uniform on the one compiled program, §148.2). Base
arms `uGate.on=0`, gated arms `uGate.on=1`, `temple.back` `uGate.on=0`. As designed.

## D1 — selectivity (registered: "Outside the gated population the frame must be bit-identical to base, 0 px")

Sealed scorer output (strict = ANY byte differing; the ΣRGB≥4 count is shown beside it and is NOT
the D1 number — threshold stated per §122.1):

| shot | strict px | ΣRGB≥4 px | scorer line |
|---|---|---|---|
| hero (base vs gated) | **0** | 0 | OK |
| dunes (base vs gated) | **0** | 0 | OK |
| courtyard (base vs gated) | **660** | 500 | **<<< D1 FAIL** |
| temple.back vs temple.base (restore control) | **0** | 0 | OK — temple rows valid |

**Scorer's D1 verdict: FAIL** (its operationalisation makes hero/dunes/courtyard whole-frame 0 px,
premised on §145.2's fx21 census that daylight exteriors contain no dark-blue surface class).

**Applying the registered wording exactly** — the zero-px requirement is scoped to *outside the
gated population*, and the task is to show the 660 pixels' classification. Structural fact first:
determinism within these boots is proven by hero, dunes and temple.back at strict 0 px, and §148.2's
one-program-one-uniform design means an ungated fragment executes `a *= 1.0` bit-exactly — so every
differing pixel is a particle fragment the gate actually attenuated (`wl·wr > 0` at its backdrop
sample). The contested question is whether the backdrop under those fragments *qualifies under the
registered rule* (luma < 60 AND R/B < 0.5, registered in graded-PNG units) — i.e. whether the
shader's population coincides with the registered population there, or the gate leaked.

Per-pixel classification: see `fx22d1class.mjs` output below (section D1a) — **the numbers there
decide whether the 660 px are in-population (which makes them D4's business, not D1's) or
out-of-population (a leak, D1 FAIL as worded).** Note the pincer: courtyard's changed pixels sit at
removed means +6.2…+25.4 (scorer D4 table), so **either** they are over qualifying backdrop — then
they are non-disc components removed ≥ 3.0, i.e. registered D4 violations — **or** they are over
non-qualifying backdrop — then D1 fails as worded. There is no reading of the registered text under
which courtyard's 660 px are clean.

*(D1a classification appended after the supplementary pass below.)*

## Pre-D2 gate — classifier verification (§148.3/§150.2)

The shader's gate arithmetic reproduced on the CPU over the very texels the shader samples, at the
two registered component centres, in every temple arm (and identically in `temple.base` /
`temple.gated` / `temple.back` — the backdrop RT does not depend on the gate uniform):

| centre | raw RT texel | enc | bl | rb | wl | wr | factor | fires |
|---|---|---|---|---|---|---|---|---|
| disc (602,133) | (1,5,14) | [20.5,42.7,68.2] | 39.82 | 0.301 | 1 | 1 | **0** | **true (full)** |
| non-artefact (520,581) | (13,16,17) | [65.9,72.4,74.5] | 71.20 | 0.885 | 0 | 0 | **1** | **false (exactly 0 weight)** |

Anchors (sanity report, NOT the test — pre-grade vs graded-PNG are different quantities): disc
sampled bl 39.82 vs graded anchor 44.4; non-artefact 71.2 vs 76.6. Same side, plausible offset.

**CLASSIFIER: CORRECT — fires at the disc, exactly zero at the non-artefact. D2 is scoreable.**

## D2 — removal, not thinning (structural, on temple)

Registered detector: residual vs ring-median ≥ 3.0 (the registered Arm B line), 4-connected ≥ 40 px,
window = registered bbox (602,133)-(659,193) pad 40.

- **Calibration on temple.base: the disc is found** — 2496 px mean +19.23 (plus a 48 px +18.86
  component). Premise present (§122.3 satisfied): the artefact is in this frame.
- **Instrument control: the detector fired on 4/4 disc-free windows of the same base frame**
  (components up to 2426 px at mean +70.77 — the temple frame is full of local structure brighter
  than a ring median). Scorer's own registered fallback, printed before its verdict line: *"its
  positive answers are not trustworthy where it fired; adjudicate on the D3 crops (the picture is
  the finding)."*
- On temple.gated the detector reports 583 px mean +29.36 and 48 px mean +18.86 inside the bbox.
  The 48 px component is **byte-identical in base and gated** (same size, same mean to 2 dp) —
  static scene content, not sprite. The 583 px positive is exactly the class of answer the 4/4
  control failure invalidates (bright painted star-ceiling content inside the window, no longer
  buried under the +17 disc wash, sits far above the ring median).
- Quantitative removal cross-check (base→gated component overlapping the bbox):
  **2195 px, 58×59 at (602,135), mean ΔL +18.71, total |ΔL| 41,108** — against the registered
  anchor 2803 px, +17.28, 48,436. The disc reproduced in this boot and was removed at full depth.

Scorer's mechanical line: `D2: FAIL — residual component(s) survive: thinning`. **Adjudication is
the crops', per the instrument's own control clause — see D3 below.** *(finalised after looking)*

## D4 — anti-proxy (registered: every component attenuated > 20 % must be the disc or under ΔL 3.0, enumerated by name)

The sealed operationalisation (committed pre-capture in the scorer header): a non-disc component
whose **removed** mean |ΔL| ≥ 3.0 is a violation either way — it was either >20 % attenuation of a
>3.0 component (fails the rule as worded) or a ≥15 ΔL component unknown to the census (worse).
`night` and `interior` are the deliberate false-positive population (§150.3).

| shot | changed px (ΣRGB≥4) | total removed |ΔL| | comps ≥40 px | **D4 violations** |
|---|---|---|---|---|
| temple | 4,504 | 64,583 | 20 | **16** |
| hero | 0 | 0 | 0 | 0 |
| dunes | 0 | 0 | 0 | 0 |
| courtyard | 500 | 6,512 | 6 | **6** (all six) |
| night | 8,314 | 47,108 | 40 | **33** |
| interior | 1 | 2 | 0 | 0 |

**D4: FAIL — 53 non-disc components with removed mean |ΔL| ≥ 3.0, all named in the scorer log**
(`progress/records/logs/fx22an-r4.log`). The shape of the failure, read off the enumeration:

- **night is the registered false-positive trap springing exactly as designed** (§150.3: *"if the
  backdrop proxy has drifted off the mechanism it over-fires there and D4 catches it"*): 33 named
  violations at removed +3.2…+10.8, essentially all over genuinely dark-blue night sky/shadow
  (behind-after luma 10–58, R/B 0.08–0.39). Total removed |ΔL| 47,108 — **the gate deleted the
  night haze field wholesale**, a quantity comparable to the temple disc itself (41,108).
- **temple's own field went with the disc**: 16 non-disc violations, removed +5.4…+32.7. Several sit
  over dark-blue star-ceiling backdrop (e.g. 110 px at (406,14) removed +32.70 over luma 56.2 / R/B
  0.37) — in-population field removal. **And several sit over backdrop that is NOT dark-blue in the
  graded frame** (211 px at (767,145) removed +19.01 over luma 103.9 / R/B 1.04; 102 px at (553,192)
  +5.38 over luma 145.8 / R/B 1.40; 42 px at (756,19) +6.49 over luma 171.9 / R/B 1.34) — removals
  where the graded backdrop is bright sand, the §148.3 units/space gap or quarter-res sampling
  showing up as real leakage.
- **courtyard: all 6 components are violations** (removed +6.2…+25.4); five over dark-blue-ish
  shadow backdrop (luma 35.8–63.7, R/B 0.02–0.88), one — 51 px at (120,609), removed +8.26 — over
  **luma 60.1 / R/B 1.89**, decisively sand-coloured backdrop: a leak case by any reading.

## Arm C — interior cost (supplementary; cross-boot vs fx21 baselines, labelled as such by the sealed scorer)

- temple non-disc removed total |ΔL| = **22,550** across 19 components. Baseline (non-disc field)
  25,192; registered 15 % budget = 3,779. Estimated surviving field = 25,192 − 22,550 = **2,642**,
  band 21,413…28,971 → **OUTSIDE the band** (removed ≈ 6× the whole budget; ~90 % of the interior
  field deleted). Cross-boot estimate, but not close.
- Per-component clause at the strict-gate collateral (433,68) [baseline ≈ 1,053 total |ΔL|]:
  removed there **540** → **OVER** the registered 50 % per-component cap (cross-boot).

Arm C is supplementary in this scoring (its baselines are fx21-boot frames that no longer exist),
but both of its registered bounds are breached by the removed-amount lower bounds, in the direction
that cannot be blamed on the boot change: removal is measured within one boot here.

*(D1a classification, D3 crop adjudication, and VERDICT follow.)*

# RESULT — fx22 r4: candidate 1 (backdropGate) scored against PREREG-sandhigh.md Amendment 1, arms D1–D4

**VERDICT: REJECT — see the block at the bottom.** Scored in the registered order and letter (D1,
pre-D2 classifier gate, D2, D3, D4), by a fresh FX agent, from committed evidence only. The sealed
scorer `progress/records/cand1/fx22an.mjs` was run **unmodified**; its full output is preserved
verbatim at `progress/records/logs/fx22an-r4.log`. Per the scorer's own footer: *"This file
evaluates; the RESULT decides, after the crops have been looked at."* The crops were looked at.

## Provenance

- **Run**: fx22 r4, four chunks per §164.1 (`temple` / `hero+dunes` / `courtyard+night` /
  `interior`), one boot per chunk, every registered comparison within its chunk's boot (each
  base/gated pair shares its boot; `temple.back` rides the temple chunk). Run logs
  `progress/records/logs/fx22-r4c{1,2,3,4}.log` — all four end `fx22 DONE`.
- **Tree**: `src/**/*.js` hash at scoring =
  `3fea650a4d645857e4843149d19e5445f133ac33172a321c128517a87a7a7a57` = prelaunch stamp = the
  registered stamp in `cand1/fx22.treehash.json` (postrun field now filled). The tree never moved
  across the whole r4 window; §121.4 closed for this run. Head at prelaunch `47de8f1`, 0 dirty src
  files.
- **Evidence scored**: the COMMITTED copies under `progress/records/cand1/frames/` (13 PNGs +
  `fx22.json`, landed across commits 8391e43…efef525). Verified byte-identical (sha256, table
  below) to the live `shots/fx22/` copies, then copied over them so the scorer's fixed paths read
  committed bytes.
- **Renderer**: SwiftShader in all four boots. Frame-time cost of the extra backdrop pass remains
  **unmeasured, not estimated** (§148.1).
- **Arm stamps** (all 13 jobs): `lumaMax=60 rbMax=0.5 soft=8/0.08 min=0`, `sandHigh live=900`,
  `backdropRT 320x180 bound=true` in **both** arms — the particle-free backdrop pass runs in base
  arms too; the only difference between arms is the one `uGate.x` uniform on the one compiled
  program (§148.2). Base arms `uGate.on=0`, gated arms `uGate.on=1`, `temple.back` `uGate.on=0`.

### Evidence sha256 (committed == live, verified before scoring)

| file | sha256 |
|---|---|
| temple.base.png | 221685c77d853f4cc4cf450e0a973a574541167d5d9c1a482fcc1576dc2b3ef3 |
| temple.back.png | 221685c77d853f4cc4cf450e0a973a574541167d5d9c1a482fcc1576dc2b3ef3 (== base: restore control is byte-identical) |
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

---

## D1 — selectivity. **FAIL.**

Registered wording (A1.3): *"Outside the gated population the frame must be bit-identical to base,
0 px, not merely within a percentage. … A backdrop gate that leaks — wrong buffer, over-wide ramp —
fails it too, so it is not free for a badly implemented candidate 1, only for a correct one."*

Sealed scorer output (strict = ANY byte differing; the ΣRGB≥4 count is beside it and is NOT the D1
number — threshold stated per §122.1):

| shot | strict px | ΣRGB≥4 px | scorer line |
|---|---|---|---|
| hero (base vs gated) | **0** | 0 | OK |
| dunes (base vs gated) | **0** | 0 | OK |
| courtyard (base vs gated) | **660** | 500 | **<<< D1 FAIL** |
| temple.back vs temple.base (restore control) | **0** | 0 | OK — temple rows valid |

The scorer's operationalisation (whole-frame 0 px on the three exteriors, premised on §145.2's
"daylight exteriors contain no dark-blue surface class") returns **FAIL** on courtyard.

**The registered wording applied exactly, with the pixels' classification** (the zero-px
requirement is scoped to *outside the gated population*, so the 660 px were classified —
`cand1/fx22d1class.mjs`, output at `logs/fx22d1class-r4.log`, registered constants only: the
population rule luma < 60 AND R/B < 0.5 in its registered graded-PNG units; behind-after read the
scorer's own way, off the gated frame):

- Structural fact first: hero, dunes and the restore control at strict 0 px prove within-boot
  determinism, and §148.2's one-program-one-uniform design means an ungated fragment executes
  `a *= 1.0` bit-exactly — so all 660 differing pixels are particle fragments the shader's gate
  actually attenuated. The question D1 asks is whether the *registered* population contains them.
- **courtyard: 402 px (60.9 %) IN the registered population** (387 core, 15 in the sealed
  soft-ramp edge zone); **258 px (39.1 %) OUT** — behind-after luma up to 160.5, R/B up to 2.53.
  118 of the OUT px have luma ≥ 60; 140 are dark but fail the R/B<0.5 conjunct (warm shadow, not
  blue). The OUT pixels group into ~6 sites (largest: (229–245,336–344) 92 px; (120–133,609–618)
  80 px; (959–969,197–199) 20 px), several showing removed ΔL of +20…**+78** at single pixels —
  bright compact particles deleted against backdrop the registered rule does not gate.
- The method's stated bias runs **toward** OUT (partial-attenuation residue lifts the behind-after
  reading), but it cannot manufacture these: to relocate the big OUT pixels into the population,
  the true backdrop would need to sit 25–100 luma below the reading, while the probe-verified
  pre-grade↔graded offset in the dark range is ~5 luma (39.82↔44.4, 71.2↔76.6), and no sandHigh
  contribution in any census approaches that residue (exterior field mean ΔL ≈ 2.1, max component
  +4.12 in fx21).

**D1 verdict: FAIL — on the sealed operationalisation directly, and on the registered wording as
worded: 258 of 660 differing pixels lie outside the registered gated population.** The pincer is
airtight in the other direction too: the 402 in-population pixels belong to non-disc components
removed at ≥ 3.0 mean |ΔL|, which are registered D4 violations (below) — there is no reading of
the registered text under which courtyard's changed pixels are clean.

(Recorded, not scored: `interior`'s 19 strict px — max single-channel Δ 2, ΣRGB≥4 = 1 px, all at
one 8×4 site (293–300,143–146) with behind-after luma 40–61 / R/B 0.66–1.01 — are edge-zone units
slack between the shader's enc space and the graded rule, at negligible magnitude. `interior` is
not in D1's registered shot set; it is D4's false-positive population and produced no component.)

## Pre-D2 gate — classifier verification (§148.3/§150.2). **CORRECT; D2 is scoreable.**

The shader's gate arithmetic reproduced on the CPU over the very texels the shader samples, at the
two registered component centres, identical in every temple arm (the backdrop RT does not depend on
the gate uniform):

| centre | raw RT texel | enc | bl | rb | wl | wr | factor | fires |
|---|---|---|---|---|---|---|---|---|
| disc (602,133) | (1,5,14) | [20.5, 42.7, 68.2] | 39.82 | 0.301 | 1 | 1 | **0** | **true (full)** |
| non-artefact (520,581) | (13,16,17) | [65.9, 72.4, 74.5] | 71.20 | 0.885 | 0 | 0 | **1** | **false (weight exactly 0)** |

Fires at the disc with full removal (factor 0, `backdropMin` 0); exactly zero weight and factor
exactly 1 at the non-artefact. Anchor comparison (sanity report, NOT the test — pre-grade vs
graded-PNG are different quantities): disc bl 39.82 vs graded 44.4; non-artefact 71.2 vs 76.6 —
same side, plausible offset. **The registered 2×2 held in-engine: D2 is scoreable, and no
threshold was moved.**

## D2 — removal, not thinning (structural, on temple). **PASS, by the instrument's own registered adjudication route — the crops.**

Registered detector: residual vs ring-median ≥ 3.0 (the registered Arm B line), 4-connected
≥ 40 px, window = registered bbox (602,133)-(659,193) pad 40.

- **Calibration (premise, §122.3): the disc is found in temple.base** — 2496 px mean +19.23
  (ring bg L 46.1), plus a 48 px +18.86 component. The artefact is in this frame.
- **Instrument control: the detector fired on 4/4 disc-free windows** of the same base frame
  (components up to 2426 px mean +70.77 — the temple interior is full of local structure brighter
  than a ring median). The scorer's own registered clause, printed before its verdict line: *"its
  positive answers are not trustworthy where it fired; adjudicate on the D3 crops (the picture is
  the finding)."*
- On temple.gated the detector reports 583 px mean +29.36 + 48 px mean +18.86 inside the bbox, so
  the mechanical line prints `D2: FAIL — residual component(s) survive: thinning`. But: the 48 px
  component is **identical in base and gated** (same size, same mean to 2 dp) — static scene
  content; and the 583 px positive is exactly the class of answer the 4/4 control failure
  invalidates.
- **The crops adjudicate** (`crops/temple-disc-base-4x.png` vs `temple-disc-gated-4x.png`, looked
  at): base shows the registered artefact — a large soft mauve wash over the blue star ceiling.
  **Gated shows it GONE: the star ceiling reads cleanly, star rings and the orange gilded
  architecture (static, present in both) intact, no mauve remnant at 4×.** The detector's
  surviving positive is that static bright content, no longer merged with the disc wash.
- Quantitative cross-check: the removal component overlapping the bbox is **2195 px, 58×59 at
  (602,135), mean ΔL +18.71, total |ΔL| 41,108** against the registered anchor 2803 px / +17.28 /
  48,436 — the disc reproduced in this boot and was removed at full depth (factor 0 verified at
  the centre).

**D2 verdict: PASS — the disc ceased to exist as a ≥ 40 px component; removal, not thinning.** The
mechanical FAIL line is the invalidated detector speaking; the registered tie-break ("the picture
is the finding") and the factor-0 probe both say removal. Scored so, with the disagreement shown
rather than hidden.

## D3 — the picture, both halves at 4×. **FAIL (second half).**

Registered wording: *"the disc gone and the star ceiling reading cleanly, **and** `temple`'s
legitimate haze — the 23 non-gated components — visibly intact. The claim was always two-part."*

- **Half 1 — PASS.** The disc is gone and the star ceiling reads cleanly (crops above; also
  `temple-nonart-*`: the registered non-artefact wisp at (520,581) is preserved — the pair is
  visually identical, matching its factor-exactly-1 probe).
- **Half 2 — FAIL, visibly.** The temple field did not survive the gate:
  - `temple-x406y14-ceilfield-*-4x.png`: over the star ceiling away from the disc, a bright glow
    (110 px, removed +32.70) and a soft haze blob (83 px, +12.82) are **plainly deleted** in the
    gated frame — legitimate ceiling-field haze, gone.
  - `temple-x767y145-brightbd-*-4x.png`: a compact bright particle sitting against the **sunlit
    sand wall** (behind-after luma 103.9, R/B 1.04 — nowhere near the population) is **deleted
    outright** (211 px, removed +19.01). Visually it is a sparkle/glint-class particle, not haze,
    and it vanishes — the gate reaching entirely outside its mechanism.
  - `temple-x543y181-brightbd-*-4x.png`: the removals over the bright wall there (+5.4/+7.8 means)
    are subtle at 4× — present in the numbers, barely legible in the picture; reported as such.
  - By the numbers (D4 table below and Arm C), temple's non-disc field lost 22,550 of a 25,192
    baseline — ~90 % of the interior field — and the deletions above are the visible face of it.

**D3 verdict: FAIL — the claim is two-part and the second part is refuted by looking.**

## D4 — anti-proxy, every attenuated component named. **FAIL — 53 named violations.**

Registered rule: *"every component the shipped gate attenuates by > 20 % must be either the disc or
under ΔL 3.0, enumerated by name."* Sealed operationalisation (scorer header, committed
pre-capture): removed mean |ΔL| ≥ 3.0 on a non-disc component is a violation either way. `night`
and `interior` are the deliberate false-positive population (§150.3).

| shot | changed px (ΣRGB≥4) | total removed \|ΔL\| | comps ≥ 40 px | **violations** |
|---|---|---|---|---|
| temple | 4,504 | 64,583 | 20 | **16** |
| hero | 0 | 0 | 0 | 0 |
| dunes | 0 | 0 | 0 | 0 |
| courtyard | 500 | 6,512 | 6 | **6 (all)** |
| night | 8,314 | 47,108 | 40 | **33** |
| interior | 1 | 2 | 0 | 0 |

All 53 are named with size, position, removed ΔL and behind-after backdrop in
`logs/fx22an-r4.log`. The shape of the failure:

- **night — the registered false-positive trap sprung exactly as designed** (§150.3: an exterior
  full of dark blue; "if the backdrop proxy has drifted off the mechanism it over-fires there and
  D4 catches it"). 33 violations, removed means +3.2…+10.8, essentially all over genuinely
  dark-blue sky/shadow (behind-after luma 10–58, R/B 0.08–0.39), spanning the whole frame
  (bbox x0–1279, y5–719). Total removed 47,108 — **the gate deleted the night haze field
  wholesale**, a quantity comparable to the temple disc itself (41,108).
- **temple — the interior field went with the disc**: 16 non-disc violations, +5.4…+32.7. Some are
  in-population field removal over the star ceiling (e.g. 110 px at (406,14), +32.70, backdrop
  56.2/0.37); **and 12 sit over backdrop that is NOT in the population in the graded frame** —
  e.g. 211 px at (767,145) +19.01 over luma 103.9 / R/B 1.04; 102 px at (553,192) +5.38 over
  145.8 / 1.40; 42 px at (756,19) +6.49 over **171.9 / 1.34** — bright-sand-backdrop deletions,
  i.e. leakage (quarter-res/bilinear backdrop sampling at colour boundaries and the §148.3
  pre-grade↔graded gap are the available mechanisms; either way the registered rule counts them).
- **courtyard — all six components are violations** (+6.2…+25.4): five over dark-blue-ish shadow
  or blue-painted trim (behind-after luma 35.8–63.7 — `courtyard-biggest-*-4x.png` shows the
  (64,160) case: haze over the blue trim band, removed), one — 51 px at (120,609), +8.26 — over
  **luma 60.1 / R/B 1.89**, sand in shadow, a leak by any reading.

**D4 verdict: FAIL.** This is the arm the amendment built to be "not free for a badly implemented
candidate 1", and it is the decisive one: the backdrop proxy fires far beyond the mechanism it was
a proxy for.

## Arm C — interior cost (supplementary here: registered against fx21-boot baselines whose frames no longer exist; scored as removed-amount bounds, cross-boot, per the sealed scorer's own labelling)

- temple non-disc removed total |ΔL| = **22,550** across 19 components. Baseline (non-disc field)
  25,192; registered 15 % budget = **3,779**. Estimated surviving field 25,192 − 22,550 = **2,642**
  vs registered band 21,413…28,971 → **OUTSIDE the band** — removal ≈ 6× the entire budget; ~90 %
  of the interior field deleted. (Removal is measured within one boot; only the baseline is
  cross-boot.)
- Per-component clause at the strict-gate collateral (433,68) [baseline ≈ 1,053]: removed **540**
  → **OVER** the registered 50 % per-component cap (marginally; cross-boot; the crop pair
  `temple-collat-*-4x.png` shows the site — visually near-identical, the removal there is mean
  +1.88 over 269 px plus small neighbours).

Both registered Arm C bounds are breached in the direction the boot change cannot explain. Recorded
as supplementary confirmation of D3/D4, not as a primary gate.

---

## VERDICT

```
VERDICT: REJECT  (candidate 1, backdrop-conditioned suppression — the backdropGate in
                  src/fx/Particles.js, commit 6f7fd42)

  D1  selectivity            FAIL   courtyard 660 strict px ≠ 0; 258 of them outside the
                                    registered population (leak), 402 inside (which makes them
                                    D4 violations) — fails on either horn
  pre-D2 classifier          PASS   fires at disc (factor 0), exactly zero at non-artefact
  D2  removal not thinning   PASS   disc ceased to exist; adjudicated on the crops per the
                                    detector's own 4/4 control failure
  D3  the picture            FAIL   half 1 (disc gone) passes; half 2 (field intact) refuted
                                    by looking — ceiling haze and a bright wall particle
                                    visibly deleted
  D4  anti-proxy             FAIL   53 named non-disc components removed at ≥ 3.0 mean |ΔL|
                                    (night 33 — the registered false-positive trap; temple 16,
                                    12 of them over out-of-population bright backdrop;
                                    courtyard 6)
  Arm C (supplementary)      OUT    interior non-disc removal 22,550 vs 3,779 budget (~6×);
                                    collateral per-component cap also over

  Not VOID (temple restore control byte-identical; all chunks DONE; tree stamps match the
  registered hash before and after). Not UNSCOREABLE (the classifier verification passed, so
  D2 was scoreable and scored). The registered outcome for a failed discriminator is the seal's
  revert-not-defend, applied to the CANDIDATE, not the scorer:

  SHIP RULE => the gate REVERTS. The revert of commit 6f7fd42's src/fx/Particles.js change is
  the COORDINATOR's to apply per the seal (this agent touches no src/**). Until it lands,
  TUNE.backdropGate:false is the committed kill switch that "restores current behaviour
  exactly" (cand1.patch note) — but the clean revert is the registered consequence.
```

### What the run establishes beyond the verdict (record, don't chase — findings for the next design, none of them re-opens this scoring)

1. **The mechanism evidence survives; the implementation's reach is the defect.** The classifier
   isolated the registered 2×2 in-engine (fires at the disc, exactly zero at the non-artefact),
   and the disc removal is real and structural (D2). What failed is everything the proxy touches
   beyond that: the gate multiplies **every** particle batch wherever the quarter-res backdrop
   sample reads dark-and-blue, and the world contains far more dark-and-blue than the one wrong
   pairing — the night sky above all.
2. **§145.2's "daylight exteriors contain no dark-blue surface class" was a census of one boot's
   component means, not a property of the level.** This boot's courtyard put sprites over blue
   trim and warm-dark shadow (402 in-population px), and its particles land elsewhere every boot.
   The premise that made hero/dunes/courtyard a whole-frame-0px D1 population does not transfer
   across boots.
3. **A candidate second instance of the artefact class, for A1.5's re-test clause:**
   `night-biggest-base-4x.png` shows a soft mauve wash over the dark-blue night sky (1401 px,
   removed +5.15 at (959,42)) — visually the temple disc's cousin. This prereg registered night as
   false-positive territory, so removing it counts against candidate 1 here; whether a night sky
   is a legitimate sand-haze backdrop is a question ONLY a future prereg may adjudicate. n = 1 may
   not be 1 after all, but that is next-seal business.
4. **The bright-particle deletions are the sharpest leak evidence**: compact bright particles
   (sparkle/glint class, not haze) deleted against bright sand walls — temple (767,145) removed
   +19.01 over graded luma 104; courtyard (235,342) removed up to +78 at single pixels. A gate
   built for sand_haze's pairing defect reached gameplay-affordance-class sprites on sunlit
   stone, because it was wired into the shared batch shader rather than scoped to the field it
   was designed for.
5. **Frame-time of `_copyBackdrop` remains unmeasured** (software raster) — moot for this
   candidate now, but the second-scene-render cost stands as the price tag of any future
   backdrop-keyed design (§148.1).

### Files of record for this scoring

- `progress/records/cand1/RESULT-fx22.md` — this file (the decision)
- `progress/records/logs/fx22an-r4.log` — sealed scorer output, verbatim
- `progress/records/cand1/fx22d1class.mjs` + `progress/records/logs/fx22d1class-r4.log` — D1a
  per-pixel classification (post-hoc diagnostic, registered constants only)
- `progress/records/cand1/crops/` — 18 crops: 12 written by the sealed scorer, 6 supplementary
  (`temple-x*-4x.png`, cut from the committed frames at 4× nearest for D3's second half)
- `progress/records/cand1/fx22.treehash.json` — postrun field filled; prelaunch == postrun ==
  registered stamp
- `progress/records/cand1/fx22.json` — copied beside the scorer by the scorer itself, byte-equal
  to `frames/fx22.json`

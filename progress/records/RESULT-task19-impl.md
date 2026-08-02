# RESULT — task #19 implementation (CHARACTER), CPU-verified, capture pending

Baseline for every A/B below: `git archive` extract of f4fb95e (pre-change HEAD) at
`$SCRATCH/headtree`. No capture was launched; verdicts that need pixels wait for the
coordinated batch. The coordinator's sweep committed the edits mid-session; working tree and
HEAD are byte-identical, nothing was committed by me.

## 1. Tail A+B (PREREG-tailtip.md — sealed; the seal governed, no deviation)

- **A, tip:** 4-lock radial fan → 3-wedge merged terminal lock. Bases staggered along −tipT
  at −0.010/−0.050/−0.090·G, perp 0.30 → 0.10, azimuths clustered on the down-swept side
  (−π/2 ± 0.35), lengths 0.085/0.065/0.050·G, widths 0.048/0.042/0.036·G, bend 0.30,
  furDark on tailD. `src/player/SlyModel.js`, the `TIPLOCK` block.
- **B, underside:** both ring sets now append the mirrored {±1.9, ±2.5} so the underside
  pair exists at EVERY station (spacing halves), and |roll0| > 1.7 lays back at outward 0.30
  (was 0.46). Keyed on roll0, not the jittered roll, so jitter cannot flip regimes.
- **Cost, measured:** +522 tris (29 net clumps × 18) = the prereg's own arithmetic at the
  real station count (15, prereg estimated ~16 → "≈ +558"). Body 15,482 → 16,004 tris,
  no group/draw-call change.
- **Verdict pending:** cap6 (`sly-closeup` + `sly-key`, one boot) per the prereg; frozen
  instrument `$SCRATCH/taillobes.mjs` (baseline tip 2 / under 7), sealed bands T-tip PASS
  {0,1}, T-under PASS [0,2] / IMPROVED [3,5], deletion guards under ≥3.5 px, tip ≥2.0 px,
  interiorink ratio hold [0.97, 1.16]. House rule: look 1x then tail 2x before any number.

## 2. Pupil bones (SPEC-startle-pupils — as specified, zero deviation)

- `pupilL`/`pupilR`, children of `head`, parked exactly at each eye's pupil centre. The eye
  frame + pupil-centre arithmetic was extracted to `_eyeFrame(side)` — single source shared
  by `_buildSkeleton` and `_buildEye`, so bone and disc cannot drift apart. Appended to
  `boneNames` (32 → 34; existing skin indices untouched).
- Pupil AND glint ellipsoids re-weighted `[['head',1]]` → `[[pupilX,1]]`; ranges published
  as `sly.pupilRanges` — pupilL [4934,5138), pupilR [5427,5631) — like `tuftRanges`.
- Clips: `hurt` sc 0.35 at the snap key, held through 0.16, sc-only recovery key at 0.42
  ('out'); `ko` sc 0.45 at t=0 → 0.72 at the 1.3 settle key. Sampled at holds:
  hurt@0.1 = 0.350, ko@0.9 = 0.540 (mid-recovery, dazed).
- **Zero-regression gate PASSED** (`$SCRATCH/pupildiff.mjs`, record in RESULT-pupildiff.txt,
  run BEFORE the tail edit entered the tree): 52/52 holds, vertex counts equal, **zero moved
  vertices outside pupilRanges in every clip**; inside the ranges only fp noise (≤3e-16)
  except hurt (max 2.9 cm) and ko (2.0 cm) — the authored constrictions. §4.7: 52/52 names
  verified in both trees.
- Capture-side calibration/verdict (sly-startle + sly-closeup pair, darkFrac/glintMax
  bands) is the coordinator's batch, per the SPEC's two-stage seal.

## 3. Perch cane re-aim (item 3)

`[-30,30,-30]` → `[-40,40,80]` at t=0/3.2; breath keys moved by the same delta:
0.8 → `[-36,36,80]`, 1.7 → `[-44,44,80]` (§9 orphaned-key rule; the 2.3 key carries no cane).
Compiled track times verified. Frame verification rides the batch's tail/pupil shots
(`hero` freezes this clip).

## 4. Palette decision — recorded, no knob moved

`$SCRATCH/NOTE-tailpalette.md`: **cream+navy is the authored intent** (K4 expectation
updates; teal-in-frame remains SHADING's Band A grade finding), and **the 4.5:1 ladder
stays** — hue-only rings in shadow accepted conditionally on the grade fix landing, with the
reopen path named (own mini-seal, thresholds frozen only against post-grade-fix pixels).

## Item 4 (limb ink): untouched, per instruction — design-only until it has its own prereg.

Files: `src/player/SlyModel.js`, `src/player/Clips.js` only. Records in scratchpad:
RESULT-pupildiff.txt, RESULT-postcheck19.txt, NOTE-tailpalette.md, pupildiff.mjs,
postcheck19.mjs.

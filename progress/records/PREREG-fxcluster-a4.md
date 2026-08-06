# PREREG-fxcluster-a4 — sub-arm A, fourth letter: a3's instrument, a3's defects fixed

**Owner:** FX. **Date sealed:** 2026-08-06, before any a4 capture exists.
**Parent chain:** `PREREG-fxcluster` §A (UNSCOREABLE) → `-a2` (UNSCOREABLE, contaminant named)
→ `-a3` (UNSCOREABLE by P-A3a; instrument vindicated at E/N 163, §13 clause 54×; both earlier
letters' headline number falsified — §178). **All three parent verdicts stand untouched.**
**Lever unchanged for the fourth letter:** `debug.guardTowardCamera = −0.20` through the
committed seam `src/ai/Guard.js:1832`. No new treatment.

**Registration tree:** `adb5629032309d19` (`find src -name '*.js' | sort | xargs sha256sum |
sha256sum`, §121.4). Same tree a3 registered and ran on; `src/` carries no working-tree diff.

**Coordinator dispatch (§174):** the two one-liners a3's letter named — the discard
`setShot('guard')` before the first measured arm, and the no-harm gate off the contaminated
quadrant *or* the wipe extended to the looping fields, **chosen by measurement on the committed
a3 frames**. Keep the vindicated pool instrument, mirror and §13 clause as they are.

---

## 0. The design measurement, made before sealing (`a4-choose.mjs` → `a4-choose.json`)

**Why a3's frames can answer this.** a3's readback shows `base2`, `cand` and `restore` captured
at a bit-identical `engine.time` (1000.283333) **and** a bit-identical `beamCol0`; only `base`
is 0.03 s late. So a3 contains exactly one **clean same-state pair** and one **clean lever
pair**, and every number below is measured on those two:

- **noise = base2 → restore** (same state, both clock-pinned)
- **effect = base2 → cand** (the lever, both clock-pinned)

`base` is excluded from the design measurement precisely because a4 exists to repair it. Its
cost is reported beside each candidate as `dirty b2−base`, which is what a3 was forced to use.

### 0.1 The pool instrument, carried unchanged, re-measured on the clean pair

| statistic | effect | noise | **E/N** |
|---|---|---|---|
| ΔmedL, POOL ROI (0,400,560,700) | **−58.273** | **0.005** | **11 655** |
| ΔmeanL, same rect | −39.672 | −0.007 | 5 667 |

Per-arm pool medL: base 86.762, base2 86.404, cand **28.131**, restore 86.409. a3 measured
E/N 163 against the *contaminated* base; against a clean reference the same instrument is
essentially noise-free. **Nothing about it is changed by this seal.**

### 0.2 The no-harm gate — chosen by measurement, and the choice is the FORM, not the place

| candidate · form | effect | noise | **E/N** | dirty b2−base |
|---|---|---|---|---|
| **S1 (860,200,1000,300) · silhouette px count, L ≤ 60** | **−1622** | **+102** | **15.90** | 4322 |
| S3 (880,210,980,290) · silhouette count | −1154 | +135 | 8.55 | 3556 |
| S2 (820,180,1020,300) · silhouette x-centroid | −7.32 | +2.25 | 3.26 | 21.62 |
| S2 · silhouette count | −1885 | +811 | 2.32 | 4820 |
| S1 · x-centroid | −4.74 | +5.60 | 0.85 | 15.54 |
| *a3 incumbent* (852,220,990,300) · Δmean\|∇L\| | +0.067 | +2.589 | **0.03** | −1.867 |
| a3 incumbent · ΔmeanL | +4.099 | −5.385 | 0.76 | −12.567 |
| a3 incumbent · ΔmedL | +5.702 | −15.17 | 0.38 | −19.984 |

**S1 silhouette count wins at E/N 15.90 — 530× the incumbent's 0.03** — and clears the §13 3×
clause with 5.3× margin. Per-arm: base 5993, base2 10315, cand **8693**, restore 10417;
mirror (cand→restore) **+1724**, a ratio of 1.063 against the effect.

**The finding that decides the dispatch's either/or.** The dispatch offered "move the gate off
the contaminated quadrant, or extend the wipe". Measurement says neither is necessary, because
**the residual is low-amplitude and the winning statistic cannot see it**: the S1 box is 95.9 %
differing pixels between the two clean same-state arms, and 39.9 % of it differs by ≥ 10 L — yet
the silhouette count moves by **102 px of 10 315 (1.0 %)**, because the contamination rarely
crosses the L = 60 boundary while a level, a mean and a gradient all integrate it directly. The
gate therefore **stays on the guard, where the §17 risk actually lives**, and changes form.

**Why the wipe is NOT extended, recorded as a mechanism finding.** The looping ambient fields
are excluded from the c2/a2 wipe by design, and wiping them would not be a protocol change but a
treatment change: the arms settle with `step(10, 0)`, and **at dt = 0 nothing respawns**, so a
wiped looping field stays empty and every arm loses its ambient haze. a3's probes show those
fields identically occupied in all four arms (sandLow 460, sandHigh 900, airMotes 1000,
shimmer 90, motes 900), so the residual is per-particle history, not population — and every
statistic a4 registers is already immune to it by measurement.

### 0.3 a3's V-1 was the wrong FORM of verification, and the measurement says so plainly

a3 registered V-1 as a **whole-frame differing-pixel count at |Δ| ≥ 1**, to verify the clock
pin. Measured on a3's own frames, that statistic cannot do the job:

| region | clean same-state (b2→rest) | dirty (b→b2) | lever (b2→cand) |
|---|---|---|---|
| whole frame, \|Δ\| ≥ 1 | 287 252 (31.2 %) | 447 825 | 584 615 |
| POOL ROI, \|Δ\| ≥ 1 | 56 302 (**33.5 %**) | 122 487 | 164 687 |
| **POOL ROI, \|ΔL\| ≥ 10** | **377 (0.22 %)** | **213** | **137 910** |

**33.5 % of the pool ROI "differs" between two arms whose medL differs by 0.005 L.** A count at
|Δ| ≥ 1 counts quantisation; it conflates the pin (which a3 *proved* works, via bit-identical
`beamCol0`) with an ambient residual the pin cannot touch. That is §177-1's shape in the
verification gate itself — a number that does not depend only on what it claims to measure.
**a4 re-forms it** as a structural count on the ground the instrument reads: px with |ΔL| ≥ 10
inside the POOL ROI, where same-state reads 213–377 and the lever reads 137 910 (≈ 350×).
This is a third change beyond the dispatch's two, declared as such; V-1 was not among the three
things the dispatch said to keep, and it is the gate a3 failed on for a reason a3 itself named.

---

## 1. The arm — two changes to staging, none to the lever

Per arm, in order: **(1)** pin `engine.time = 1000.0`; **(2)** the c2/a2 pool wipe (non-looping
batches + Decals); **(3)** flag poke (cand sets −0.20, restore deletes); **(4)** `setShot('guard')`;
**(5)** `step(10, 0)`; **(6)** probe, capture.

**NEW, change 1 of 2:** before the first measured arm, a **discard `setShot('guard')`**. a3
localised its V-breaches to the rAF loop still running when the first arm's pin is written
(~2 real frames, 0.03 s), while every later arm is staged from an already-stopped loop and lands
on exactly 1000 + 17/60 = 1000.283333. The warm-up puts arm 1 in the same state as arms 2–4. Its
frame is discarded, not scored.

Arms, one boot, guard only: **warm-up (discarded) → base → base2 → cand → restore.**

## 2. Bands — every gate with its measured a3 response, and a demonstrated FAIL where one exists

§177 finding 2 / §178: a gate earns a reading only from a control that can move *and* fail.
POOL ROI = **(0,400,560,700)**; SIL BOX = **(860,200,1000,300)**, threshold **L ≤ 60**.

| # | registered quantity | band | a3 clean-pair value | shown able to FAIL? |
|---|---|---|---|---|
| **Q-A4-1** | ΔmedL cand−base, POOL ROI | **[−100, −15]** | −58.273 | out of band on a2's ROI (+6.27) |
| **Q-A4-1m** | mirror (restore−cand)/\|Q-A4-1\| | **[0.60, 1.40]** | 1.063 | a2's registered ROI gives 0.26 — out of band |
| **N-1** | \|base2−base\| medL, POOL ROI | **≤ 4.0** | 0.005 (a3 dirty 0.36) | a2 unpinned breached at 4.63 |
| **N-2** | \|restore−base\| medL, POOL ROI | **≤ 4.0** | 0.005 (a3 dirty 0.35) | as N-1 |
| **§13** | \|Q-A4-1\| ≥ 3 × max(N-1, N-2) | ≥ 0.015 at the clean floor | 58.273 | a2's ROI FAILED 6.27 vs 13.89 |
| **Q-A4-2** | no-harm: silCount(cand)/silCount(base), SIL BOX, L ≤ 60 | **≥ 0.75** | **0.843** | **FAILS at 0.581 on a3's base↔base2 pair** |
| **L-2** | licence: \|silCount(base2) − silCount(base)\| | **≤ 400 px** | **102** | **FAILS at 4322 on a3's dirty pair** |
| **V-1** | px \|ΔL\| ≥ 10 in POOL ROI, base vs base2 | **≤ 2 000** | 377 (a3 dirty 213) | lever moves it to 137 910 |
| **V-2** | `engine.time` spread across all four arms | **≤ 1e−6** | — | **a3 FAILED at 0.03** |
| **V-3** | `beamCol0` bit-identical across **all four** arms | **exact** | — | **a3 FAILED (base ≠ base2)** |
| C-1 | context: ΔmeanL, POOL ROI | report | −39.672 | — |
| C-2 | context: ΔmedL over a2's ROI (340,280,700,350) | report | +0.72 | the §178 exhibit, carried |
| C-3 | context: a3's Δmean\|∇L\| over its own rect | report | +0.067 | the retired gate, carried |

**Q-A4-2's direction and band.** The guard reads as a dark mass against the lit doorway (figure
x 820–900 at medL 18–23, wall x 960–1100 at medL 100–127), so L ≤ 60 separates them with a wide
margin either side. Harm is his silhouette dissolving; the band admits a 25 % loss of dark
population and rejects more. a3's clean pair sits at 0.843 — inside, but not by so much that the
gate is decorative.

**Honesty note carried from a3.** The lever's effect size is already known from three prior
letters; a4's registered question is **not** "is there an effect". It is: *with the first-arm
clock defect repaired and a no-harm gate that can actually move, does the whole registered set
clear at once?* The gates that can end this run are N-1/N-2, §13, Q-A4-2, L-2, V-1, V-2 and V-3
— none of which the effect's size can rescue.

## 3. Falsifiers (revert-not-defend; runtime poke, nothing to revert)

- **P-A4a** — V-2 or V-3 breach → the warm-up did not fix the first-arm clock → **UNSCOREABLE**;
  record per-arm `engine.time` and `beamCol0`; no iteration mid-run (§141).
- **P-A4b** — V-1 breach, or N-1/N-2 breach, or the §13 clause fails → **UNSCOREABLE**; the pool
  pair structure is the finding.
- **P-A4c** — Q-A4-1 outside [−100, −15] → **no ship**; cone → COORDINATOR (§4-R1).
- **P-A4d** — Q-A4-1m outside [0.60, 1.40] → whatever moved is not the flag → **no ship**.
- **P-A4e** — Q-A4-2 < 0.75 with L-2 held → the heading costs the guard's silhouette → **no ship**.
- **P-A4f** — L-2 breach → Q-A4-2 **UNCERTIFIABLE**; nothing ships on an uncertified no-harm gate.
- **Capture dies mid-run** → record what landed, stop.

**§17 declaration (carried, all three parents):** the guard's body yaw turns ~30° lens-away in
the cand arm; `SHOT_POSE.guard.look` compensation exists and is **not** part of this arm.

## 4. Chunk plan

Runner `fxcluster1/a4rerun.mjs` (a3 pattern + the warm-up; seam verify with no-edit abort; FIFO
lock via `withGame` — an sbs3 chunk may hold it, queue politely; incremental
`a4-guard.<arm>.png` + `a4-readback.json`; idempotent resume). Probes per arm: a3's, plus
`engine.time` before pin / after pin / after setShot / at capture, `beamCol0`, `senses.phase`,
looping-pool occupancy, and the warm-up's own clock reading.
**Scorer:** `fxcluster1/a4score.mjs`, thresholds transcribed from §2, statistics by the same
definitions `a4-choose.mjs` used. Outputs `a4-scores.json`, `a4-pairstruct.json`.

## 5. Decision table

| outcome | action |
|---|---|
| Q-A4-1 + Q-A4-1m + N-1/N-2 + §13 + V-1/V-2/V-3 + Q-A4-2 with L-2 held | **ship = `src/ai/Guard.js:158`, `SHOT_POSE.guard.towardCamera: 0.35 → −0.20` (widened clamp at `:1832` stays) — named for the COORDINATOR, whose decision it is** |
| P-A4a / P-A4b | UNSCOREABLE — clock probes + pool pair structure recorded, nothing ships |
| P-A4c / P-A4d | no ship — cone → COORDINATOR |
| P-A4e / P-A4f | no ship |

## 6. Files of record

`progress/records/PREREG-fxcluster-a4.md` (this seal); `fxcluster1/a4-choose.mjs` +
`a4-choose.json`; `a4rerun.mjs`, `a4score.mjs`, `a4-scorer-control.{json,txt}`;
`a4-guard.{base,base2,cand,restore}.png`, `a4-readback.json`, `a4-scores.json`,
`a4-pairstruct.json`, `logs/a4rerun-r1.log`; verdict **appended** to `RESULT-fxcluster.md`
(earlier letters never struck).

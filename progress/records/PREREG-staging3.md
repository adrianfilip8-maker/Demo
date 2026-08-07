# PREREG-staging3 — the §195.4 re-seal: staging2's lever and instruments, bands anchored on frozen-clock frames from the current tree

Successor to `PREREG-staging2.md`, whose r12 capture is **VOID (P-F3) + UNSCOREABLE (P-F2)** by
its own registered clauses (KNOWN_ISSUES §195.4): the dt-0 fix worked (P-F4 409,217 → 110 px,
3,700×), and precisely because it worked, the frozen-clock frames are a different population than
the live-dt frames every band was sized on. Same lever, same arms, same conventions, same §17
declaration. What changes: where the bands are anchored, how P-F4's band is derived, and which
metric calibrates KBmid.

**Date sealed: 2026-08-07, committed BEFORE the scored capture boots.** No `src/**` touched.
No git run by the runner — the coordinator sweeps by filename.

---

## 0. PROVENANCE — what I had seen when I wrote this (§147's disclosure form, staging2 §0's precedent)

**Seen in full:** r12's score table (`staging2/score.json`, 2026-08-06):

| arm | P1 | P2 | P3 | P4 | P5 | P7 | R2 guard-mass | pool |
|---|---|---|---|---|---|---|---|---|
| base (=preroll=restore, 2 dp) | 15.90 | 306 | 89.65 | 516 | 28.78 | 33 | **69.10** | 116.15 |
| cand | 80.70 | 668 | 24.56 | 11,036 | 43.27 | 0 | 49.87 | 114.31 |
| KBmid | 82.44 | 642 | 68.61 | 3,033 | 28.85 | 0 | 52.50 | 115.31 |
| KBover | 87.09 | 720 | 14.50 | 13,549 | 39.69 | 0 | 42.70 | 123.83 |

plus P-F4 = 110 px (maxΣ|Δ| 27), wall-times 453/244/223/235/230/221 s (§185 answered: the
preroll absorbs the compile and every scored arm lands in a tight band), the framing invariance
(843.9, 625.3)/(863.6, 244.3) identical on all arms, and the sbs3-era anchors. And, once the
derivation capture lands, its numbers (quoted in §4 where used).

| band / choice | independent of r12? | why |
|---|---|---|
| **P1 [70,100], P2 [560,720], P3 [0,70], P4 [2500,22000], P5 [26,55], P7 [0,4]** | **YES** | carried UNCHANGED from PREREG-staging2, which sealed them before r12 rendered. r12's cand passing all six is disclosed and is *not evidence used here* — a band that does not move cannot have moved toward a number. |
| **base gates re-anchored on `deriveA`** | YES of r12's cand; **NO of the derive capture** | that is their design: §195.4 orders them sized on a dt-0 base capture. Widths are the ORIGINAL bands' relative widths, carried (§4.1). |
| **P-F4 [0, 2 × measured floor]** | **NO** (r12's 110 px seen; the floor is measured by `staging3-derive`) | the band is derived from the derivation pair, not from r12; the 2× is structural (§4.2), chosen before the scored capture boots. |
| **P-F2 re-formed on P2** | **NO** | P1's saturation (KBmid 82.44 > cand 80.70) and P2's grading (306 → 642 → 668 → 720) are r12 observations. §195.4 registered this re-form the day r12 was scored. The ≥10 margin is carried VERBATIM from the original P1 clause — disclosed: r12's seen P2 gaps (336 / 26) clear it without tuning, and no margin was chosen to make that true. |
| feet/head 625/244 ± 12 | YES | carried; a geometry-solve invariance, confirmed on delivered frames twice. |

**The second reason the derivation is fresh rather than recycled from r12's own frames (§197's
lesson, learned the same day):** the §196 character ship sits between r12 and today, and
`SHOTS.guard` places the player. The derive readback records `characterRoot: "sly3"` — these
anchors describe the tree that will actually be measured.

---

## 1. The lever — identical to staging1/staging2

`src/core/Shots.js`, `SHOTS.guard`, translated −1.75 m on x, position and target together:
`pos [-11.5, 2.6, 30.5] → [-13.25, 2.6, 30.5]`, `target [-17.0, 1.1, 28.0] → [-18.75, 1.1, 28.0]`.
`fov` 38, `tod` 0.10, `player`, `roll` unchanged. Rationale: `PREREG-staging1.md` §1, unchanged.

## 2. Protocol — staging2 §2 verbatim, plus the derivation capture

Carried: discarded preroll (§2.1), §186 vacuous (no on-disk install; in-page mutation of the live
`SHOTS.guard` object, reverted inside the hold), one boot asserted via bootId (§2.3, P-F8), arm
order `preroll2 → base → cand → restore → KBmid → KBover` (§2.4 rollback logic), `dt: 0` at every
`setShot` and `step` (§195.3), in-lock `srcTree` pair (§192.1 amendment, adopted as primary).

**New — the derivation capture** (`staging3-derive.mjs`, run to completion before this seal was
finished): one boot, shipped vectors only, `preroll (discard) → deriveA → deriveB`, where B is an
immediate second restage of the same vectors through the full `applyShot → GUARDS re-solve →
settle → capture` cycle. `deriveA` anchors the base gates; `|A − B|` is the measured
single-restage floor (§4.2).

**The scored runner's preroll writes `guard.preroll2.png`** because the derive capture already
left `guard.preroll.png` in the directory and the idempotent resume would otherwise skip the
compile-absorbing stage against a stale file — handing the ~450 s first-stage compile to `base`,
which is staging1's original defect.

## 3. Arms — unchanged

| arm | pos | target | role |
|---|---|---|---|
| `preroll2` | shipped | shipped | discarded; absorbs first-stage compile |
| `base` | `[-11.5, 2.6, 30.5]` | `[-17.0, 1.1, 28.0]` | reference |
| `cand` | `[-13.25, 2.6, 30.5]` | `[-18.75, 1.1, 28.0]` | west 1.75 m — the candidate |
| `restore` | shipped | shipped | P-F4 determinism |
| `KBmid` | `[-12.5, 2.6, 30.5]` | `[-18.0, 1.1, 28.0]` | west 1.00 m — graded calibration |
| `KBover` | `[-15.5, 2.6, 30.5]` | `[-21.0, 1.1, 28.0]` | west 4.00 m — over-move, gateless |

## 4. Registered quantities

Conventions unchanged (§122.1): L = Rec.709 on 0–255 bytes; NBC = L < 72 ∧ (B−R) > +12;
warm = (B−R) < 2; differing px at ΣRGB ≥ 4; figure rect (820,244,900,625); figure column
x ∈ [800,930], py 244..625; P7's 39 bands as made exact in the scorer.

**Base gates (P-F3 — VOID, not FAIL), anchored on `deriveA`, widths carried from the original
bands' relative widths (§4.1):**

| gate | band | anchor (`deriveA`) |
|---|---|---|
| guard-mass rect (790,100,980,330) medL, base arm | **[55.9, 63.2]** | 59.51 (deriveB 59.51 — within-derive drift 0.000) |
| doorway pool (220,360,640,560) medL, base arm | **[108.9, 120.0]** | 114.45 (deriveB 114.45 — drift 0.000) |
| solved figure feet / head px y, every arm | 625 ± 12 / 244 ± 12 | carried (invariance, twice confirmed) |

The anchor era-trace, stated because it is the story of this re-seal: guard-mass medL read 18.64
on live-dt sbs3, 69.10 on r12 (dt-0, pre-§196 tree), 59.51 here (dt-0, current tree) — three
eras, three populations, which is why §195.4 refuses anchors from any frame but the diagnosed
one. Meanwhile the figure-column absolutes are era-stable to a rounding error (P1
15.89/15.90/15.99, P2 306/306/306, P3 89.6/89.65/89.99, P7 33/33/33 across sbs3/r12/deriveA) —
the volatility is confined to the background rect, exactly where §4.1's cross-boot duty points.

**Candidate bands — VERBATIM from PREREG-staging2 §4, not renumbered, not retuned:**

| id | quantity | band (cand) |
|---|---|---|
| P1 | figure-column NOT-NBC share, rect (820,244,900,625) | [70, 100] |
| P2 | dense-mass top row (≥60%-NBC row block in x∈[800,930] reaching py 719; 720 = absent) | [560, 720] |
| P3 | NBC share of lower-right quadrant (640,360,1280,720) | [0, 70] |
| P4 | warm-pixel count, figure rect | [2500, 22000] |
| P5 | warm-pixel medL, figure rect | [26, 55] |
| P7 | per-row continuity: bands of 39 with NOT-NBC share < 40% | [0, 4] |
| **P-F4** | restore vs base differing px, frame-wide | **[0, 0]** (= 2F at F = 0, §4.2) |
| R1–R5 | cone-air medL; guard-mass medL per arm; frame NBC%; corner-NBC; wall-times | reported |

### 4.1 Why the base-gate widths are carried rather than chosen

The original gates were [17.5, 19.8] around 18.64 (−6.1% / +6.2%) and [108, 119] around 113.46
(−4.8% / +4.9%). Those widths were sealed before any staging2 frame existed. Re-using the
relative widths on the new anchors imports no information from any seen candidate number — it is
the least-derived choice available. Rounded to one decimal at write-time (§4's table).

**Registered diagnosis duty:** the gate comparison is cross-boot (deriveA's boot vs the scored
run's), and §193 established a cross-boot FX floor for *differing-pixel* counts; the floor for
rect *medians* has never been measured. If P-F3 fires while every figure-column base absolute
(P1/P2/P3/P7 of the base arm vs deriveA's) agrees, the RESULT must record the miss as a measured
cross-boot median floor — the run stays VOID (a gate that fired is a gate that fired), but the
number is the next seal's calibration, not a mystery.

### 4.2 P-F4's band, from measurement instead of assertion

r11 (live dt) read 409,217 px; r12 (dt 0) read 110 px against a sealed [0,0] — the band was an
assertion about a path whose floor had never been measured, and §195.4 orders it derived. The
derivation pair measures the single-restage floor F = |deriveA − deriveB| differing px. The
scored comparison (`restore` vs `base`) spans **two** restage cycles (base → cand → restore), so
its worst case under independent per-cycle perturbation is linear accumulation: **band =
[0, 2 × F]**, declared before the scored capture boots. If F = 0 the band is [0, 0] and perfect
restage determinism is required, as it then demonstrably holds. maxΣ|Δ| is reported beside it.

- **F measured: 0 px (maxΣ|Δ| 1, below the ΣRGB ≥ 4 threshold) ⇒ P-F4 band [0, 0].** Two
  consecutive frozen-clock restages of the same vectors are byte-equivalent at the registered
  threshold.

**Disclosed tension, registered before the capture rather than discovered after it:** r12's
restore-vs-base read 110 px (maxΣ|Δ| 27) — and that comparison ran **through the cand
excursion** (base → cand → restore), which the same-arm pair A → B cannot see. If this run's
P-F4 lands at 0 < px with small maxΣ|Δ|, the linear-accumulation model above was wrong in a
specific, nameable way: the through-cand excursion is **path-dependent** (state the intermediate
arm leaves behind), which is a determinism defect P-F4 exists to expose — the run is VOID, not
re-banded, and the registered next step is a derivation that measures the through-cand floor
directly (`base → cand → restore → restore2`, with restore2 − restore isolating the excursion
residue). The band is not widened toward r12's seen number; the model is falsifiable and this
capture tests it.

### 4.3 Calibration — KBmid graded on P2, because r12 showed P1 saturating

The original P-F2 gated KBmid's position on P1 and it saturated: 82.44 at 1.00 m west vs the
candidate's 80.70 at 1.75 m — P1 stops grading somewhere before 1 m. P2 graded across the whole
range (306 → 642 → 668 → 720). Re-formed:

- **P-F2:** on **P2**: `base < KBmid < cand ≤ KBover`, with KBmid **strictly inside the open
  interval (base, cand) by ≥ 10 at each end** (margin carried verbatim from the original P1
  clause). Failing ⇒ **UNSCOREABLE**, no verdict either way.
- P1's ordering (`base < KBmid`, `KBmid vs cand`) is **REPORTED, gates nothing** — its
  saturation is now a documented property, not a surprise.

## 5. P-falsifiers — revert, do not defend

- **P-F1** any of P1–P5, P7 outside on `cand` ⇒ candidate **not shipped**. No retune.
- **P-F2** §4.3's P2 clause fails ⇒ **UNSCOREABLE**.
- **P-F3** a base gate out ⇒ **VOID** (with §4.1's diagnosis duty).
- **P-F4** restore-vs-base differing px > 2F ⇒ **VOID**.
- **P-F6** cand figure feet/head beyond ±12 px of (625, 244) ⇒ verdict **WITHHELD**, re-anchor, re-seal.
- **P-F7** any scored arm's `armTook` false ⇒ that arm VOID.
- **P-F8** scored arms not one bootId, or `srcTreeAtLock ≠ srcTreeAtRelease` (in-lock pair,
  §192.1 as amended) ⇒ **VOID**. Outside-lock pair reported, not fatal.
- **P-F9** `guard.preroll2.png` absent, or its bootId differs from the scored arms' ⇒ **VOID**
  (the compile-absorb repair did not run in this boot).

## 6. §17 look-change declaration

Carried verbatim by reference from PREREG-staging2 §6 (itself carrying staging1 §4), including
the corner-NBC correction (delivered 33.4% vs modelled 3.4%) and the standing statement that
whether the candidate's foreground framing satisfies §7.3 is a CRITIC judgement, not a
measurement.

## 7. Decision table

| outcome | action |
|---|---|
| P-F3 / P-F4 / P-F8 / P-F9 | VOID, re-run |
| P-F7 on a scored arm | that arm VOID |
| P-F6 | verdict WITHHELD, re-anchor, re-seal |
| P-F2 | UNSCOREABLE — no verdict either way |
| any of P1–P5, P7 out on `cand` | candidate **not shipped**; report which and by how much |
| all gates in band, P-F4 ≤ 2F, KBmid strictly inside on P2 | **SHIP** the two vectors; KNOWN_ISSUES entry; the cone's §183 re-judgement runs against `staging3/guard.cand.png` with `PLINTH_Y → 720` (task #14) |

## 8. Files of this seal (coordinator sweep list — no git run by the tasks)

- `progress/records/PREREG-staging3.md` (this file)
- `progress/records/staging3-derive.mjs` (committed before its capture), `staging3/guard.preroll.png`,
  `staging3/guard.deriveA.png`, `staging3/guard.deriveB.png`, `staging3/readback-derive.json`,
  `logs/staging3-derive.log`
- `progress/records/staging3.mjs`, `progress/records/staging3-score.mjs` (both committed before
  the scored capture boots)
- `progress/records/staging3/` (scored frames, `readback.json`, `score.json`), `logs/staging3.log`
- `RESULT-staging3.md` on scoring

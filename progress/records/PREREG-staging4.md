# PREREG-staging4 — the guard-camera decision, third seal: warm-up absorbed, base gates moved onto quantities that survive a boot

Successor to `PREREG-staging3.md`, whose capture is **VOID** on P-F3 and P-F4 (`RESULT-staging3.md`,
KNOWN_ISSUES §198). Same lever, same arms, same candidate bands. Two things change, both forced by
`RESULT-staging4-floor.md` and neither of them a threshold moved after a miss:

1. **Scoring starts after three discarded stages, not one.** The floor capture showed the renderer
   makes a one-time state transition early in each boot and is **bit-exact afterwards**
   (s4 vs s5 = 0 px, maxΣ|Δ| 0). The [0,0] determinism band was never unreachable; it was being
   measured across the warm-up.
2. **The base gates move off the guard-mass rect and onto the figure-column family**, which four
   boots show is cross-boot stable, where the guard-mass rect is cross-boot *dependent*.

**Date sealed: 2026-08-07, committed BEFORE the scored capture boots.** No `src/**` touched by this
seal. No git run by the runner — the coordinator sweeps.

---

## 0. PROVENANCE — what I had seen, and which numbers are therefore not independent

**Seen in full:** staging2 r12's score table, staging3's score table, and the whole of
`staging4-floor`. Three captures of this shot, all VOID or non-scoring, plus one deliberate
measurement run.

| choice | independent of a scored candidate arm? | why |
|---|---|---|
| **P1 [70,100], P2 [560,720], P3 [0,70], P4 [2500,22000], P5 [26,55], P7 [0,4]** | **YES** | carried UNCHANGED for the third seal running; first sealed before any staging2 frame rendered. They have never moved, so they cannot have moved toward anything. |
| **P-F4 [0,0] frame-wide** | **YES** | unchanged. `staging4-floor` says keep it, and it is the stricter option. |
| **three discarded stages** | **NO** — derived from the floor capture | but derived from *base-arm* behaviour only: no candidate was in that capture at all. It is a warm-up measurement, not a verdict input. |
| **base gates on the figure-column family** | **NO** — derived from four boots of base/derive arms | same defence: every number is a BASE-arm reading. No candidate arm informs any gate. |
| **KBmid on P2** | NO (r12 showed P1 saturating) | carried from staging3, where it PASSED — the one thing that worked. |

**The rule I am applying, stated so it can be checked:** a base gate may be re-derived from base-arm
data, because its job is to certify the base arm; a **candidate** band may not be re-derived at all,
and none has been. All six candidate bands are byte-identical to their first sealing.

## 1. The lever — unchanged for the third time

`src/core/Shots.js`, `SHOTS.guard`, translated −1.75 m in x, position and target together:
`pos [-11.5, 2.6, 30.5] → [-13.25, 2.6, 30.5]`, `target [-17.0, 1.1, 28.0] → [-18.75, 1.1, 28.0]`.
`fov` 38, `tod` 0.10, `player`, `roll` unchanged. Rationale: `PREREG-staging1.md` §1.

## 2. Protocol

**2.1 Three discarded stages (the repair).** `preroll1` absorbs shader compile — measured at
453/485/504 s against ~240 s for scored stages across four runs. `preroll2` and `preroll3` absorb
the state transition the floor capture found between its second and third stage. Scoring begins at
stage four, where two consecutive same-vector restages were byte-identical. All three discarded
frames are still written to disk, so the repair is auditable rather than asserted.

**2.2 Carried from staging3, unchanged:** `dt: 0` at every `setShot` and `step` (§195); §186 vacuous
(no on-disk install — the arms are in-page mutations of the live `SHOTS.guard` object, restored
inside the hold); one boot asserted by `bootId` on every stage; in-lock `srcTree` pair (§192.1);
`armTook` probe per arm; per-stage wall-time.

**2.3 Arm order** — `preroll1 → preroll2 → preroll3 → base → cand → restore → KBmid → KBover`.
`restore` sits immediately after `cand` so P-F4 brackets exactly the window the verdict rests on.

## 3. Arms

| arm | pos | target | role |
|---|---|---|---|
| `preroll1..3` | shipped | shipped | **discarded**; compile + warm-up transition |
| `base` | `[-11.5, 2.6, 30.5]` | `[-17.0, 1.1, 28.0]` | reference |
| `cand` | `[-13.25, 2.6, 30.5]` | `[-18.75, 1.1, 28.0]` | west 1.75 m — the candidate |
| `restore` | shipped | shipped | P-F4 determinism |
| `KBmid` | `[-12.5, 2.6, 30.5]` | `[-18.0, 1.1, 28.0]` | west 1.00 m — graded calibration |
| `KBover` | `[-15.5, 2.6, 30.5]` | `[-21.0, 1.1, 28.0]` | west 4.00 m — over-move, gateless |

## 4. Registered quantities

Conventions unchanged (§122.1): L = Rec.709 on 0–255 bytes; NBC = L < 72 ∧ (B−R) > +12;
warm = (B−R) < 2; differing px at ΣRGB ≥ 4; figure rect (820,244,900,625); figure column
x ∈ [800,930], py 244..625; P7's 39 bands as the scorer makes exact.

### 4.1 Base gates (P-F3 — VOID, not FAIL), on quantities that survive a boot

Four boots of base-arm readings, and the split is unambiguous:

| quantity | sbs3 | r12 | staging3 | floor s1–s5 | spread |
|---|---|---|---|---|---|
| P1 | 15.89 | 15.90 | 15.93 | — | **0.10 (0.6 %)** |
| P2 | 306 | 306 | 306 | 306 | **0 (exact)** |
| P3 | 89.56 | 89.65 | 89.79 | — | **0.43 (0.5 %)** |
| P7 | 33 | 33 | 33 | 33 | **0 (exact)** |
| figure-rect medL | 23.19 | 23.19 | 23.19 | 23.187 | **0.003** |
| ~~guard-mass medL~~ | 18.64 | 69.10 | 65.86 | 69.104 | **9.6 L / 16 %** |
| ~~doorway pool medL~~ | 113.46 | 116.15 | 115.89 | 116.153 | 2.7 |

| gate (on the **base** arm) | band |
|---|---|
| P1 figure-column NOT-NBC | **[15.4, 16.5]** |
| P2 dense-mass top row | **[300, 312]** |
| P3 lower-right NBC | **[88.5, 91.0]** |
| P7 per-row continuity | **[32, 34]** |
| figure-rect medL | **[22.7, 23.7]** |
| solved figure feet / head px y, **every** arm | 625 ± 12 / 244 ± 12 |

Bands are the four-boot observed range plus a margin of roughly its own width. **`guard-mass medL`
and `doorway pool medL` are now REPORTED and gate nothing** — the first is boot-dependent by 16 %,
and a gate cannot be narrower than the thing it sits in (§198). Both are still printed, per boot and
per arm, because their cross-boot behaviour is now a documented property worth tracking.

### 4.2 Candidate bands — VERBATIM, third sealing, not renumbered and not retuned

| id | quantity | band (cand) |
|---|---|---|
| P1 | figure-column NOT-NBC share | [70, 100] |
| P2 | dense-mass top row | [560, 720] |
| P3 | NBC share, lower-right quadrant | [0, 70] |
| P4 | warm-pixel count, figure rect | [2500, 22000] |
| P5 | warm-pixel medL, figure rect | [26, 55] |
| P7 | per-row continuity, bands < 40 % NOT-NBC | [0, 4] |
| **P-F4** | restore vs base differing px, **frame-wide** | **[0, 0]** |
| R1–R5 | cone-air medL; guard-mass medL; frame NBC %; corner-NBC; wall-times | reported |

**P-F4 stays frame-wide and stays at zero.** The residue misses every measured rect, which would
argue for scoping it — but `staging4-floor` showed that after warm-up the frame is bit-exact, so the
stricter band is affordable and scoping it would be a convenience I have not had to buy. If it fires
now, that is a genuine determinism failure and the run is void, as before.

### 4.3 Calibration — KBmid on P2, carried from staging3 where it passed

**P-F2:** on **P2**, `base < KBmid < cand ≤ KBover`, KBmid strictly inside `(base, cand)` by **≥ 10**
at each end. staging3 read 306 < 642 < 668 ≤ 720 and passed. P1's ordering is REPORTED and gates
nothing — r12 showed it saturating and inverting (KBmid 82.44 above cand 80.70), which is why the
clause moved to P2 in the first place.

## 5. P-falsifiers — revert, do not defend

- **P-F1** any of P1–P5, P7 outside on `cand` ⇒ candidate **not shipped**. No retune.
- **P-F2** §4.3's P2 clause fails ⇒ **UNSCOREABLE**, no verdict either way.
- **P-F3** a §4.1 base gate out ⇒ **VOID**.
- **P-F4** restore-vs-base differing px > 0, frame-wide ⇒ **VOID**.
- **P-F6** cand figure feet/head beyond ±12 px of (625, 244) ⇒ verdict **WITHHELD**, re-anchor.
- **P-F7** any scored arm's `armTook` false ⇒ that arm VOID.
- **P-F8** scored arms not one `bootId`, or `srcTreeAtLock ≠ srcTreeAtRelease` ⇒ **VOID**.
  **No source edit of any kind while this capture holds the lock** — §186, and §198.1 records the
  session where I broke it and had to argue my way back to a sound capture.
- **P-F9** any of the three preroll frames absent, or a preroll `bootId` differing from the scored
  arms' ⇒ **VOID** (the warm-up repair under test did not run).

## 6. §17 look-change declaration

Carried verbatim by reference from `PREREG-staging3.md` §6 → `PREREG-staging2.md` §6 →
`PREREG-staging1.md` §4, including the corner-NBC correction (delivered 33.4 % against a modelled
3.4 %) and the standing statement that whether the candidate's foreground framing satisfies §7.3 is
a CRITIC judgement, not a measurement.

## 7. Decision table

| outcome | action |
|---|---|
| P-F3 / P-F4 / P-F8 / P-F9 | VOID, re-run |
| P-F7 on a scored arm | that arm VOID |
| P-F6 | verdict WITHHELD, re-anchor, re-seal |
| P-F2 | UNSCOREABLE — no verdict either way |
| any of P1–P5, P7 out on `cand` | candidate **not shipped**; report which and by how much |
| all gates in band, P-F4 = 0, KBmid strictly inside on P2 | **SHIP** the two vectors; KNOWN_ISSUES entry; then task #14's cone re-judgement runs against `staging4/guard.cand.png` with `PLINTH_Y → 720` |

## 8. Files of this seal (coordinator sweep list)

- `progress/records/PREREG-staging4.md` (this file)
- `progress/records/staging4.mjs`, `progress/records/staging4-score.mjs` — both committed **before**
  the scored capture boots
- `progress/records/staging4/` (scored frames, `readback.json`, `score.json`),
  `logs/staging4.log`, and the already-committed `staging4-floor.*` derivation
- `RESULT-staging4.md` on scoring

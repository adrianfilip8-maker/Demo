# RESULT-sparkcount — P-S1 FIRED. The seal is withdrawn, `skyCut` stays primary, and the dump is the finding

**Owner:** FX. **Date:** 2026-08-06. **Seal:** `PREREG-sparkcount.md`.
**Probe:** `fxcluster1/sparkcount.mjs` pid 29232 — queued 04:03:36, took the lock 04:29:18 (**1542 s**
behind `litwarm1` then `staging1`), booted, dumped `traversal-prerollOFF` at 04:31:24 and
`traversal-prerollON` at 04:39:44. **Scorer:** `node progress/records/fxcluster1/sparkcount-score.mjs`.
**No `src/**` edits. No captures. No lock ticket drawn** — the probe already held its position.
No git — the coordinator sweeps; §8 lists every file.

---

## 0. Verdict

**KB1 returned `SPARKCOUNT = 11`, not `0`. P-S1 fires.** Per seal §5, which says *revert, do not
defend*:

> **P-S1** — KB1 returns non-zero → the visibility gate does not work → **`skyCut` stays the
> registered predicate**, this seal is withdrawn, and the probe dump is the finding.

**`skyCut` remains the registered §2.1-item-6 grammar count. `SPARKCOUNT` is withdrawn as a
candidate primary. The raw count stays forbidden.**

**And the dump names why, which is worth more than the seal was:** the treatment that KB1 and KB2
differ by **does not exist at runtime**. `src/fx/Particles.js:2574` calls `sparkles.preroll(0.25)`
**unconditionally**, so "preroll OFF" is unstageable and **KB1 could not have passed on this build no
matter how good the instrument was.** The instrument was refuted by a control it was never able to
run. Both facts are reported; neither is used to excuse the other.

## 1. Measured, every number beside its registered band

```
 arm                        raw  popOpen  inFrust  SPARKCOUNT  gate
 traversal-prerollOFF        22       22       11          11  KB1 FAIL — SPARKCOUNT == 0 (raw expected ~14-17)
 traversal-prerollON         22       22       11          11  KB2 PASS — SPARKCOUNT = 14 +/- 3 (14 committed blobs)
```

| control | arm | registered band | measured | verdict |
|---|---|---|---|---|
| **KB1** | `traversal`, preroll **OFF** | `SPARKCOUNT = 0` while `rawCount ≈ 14–17` | **`SPARKCOUNT` = 11**, `rawCount` **22** | **FAIL — P-S1 fires** |
| **KB2** | `traversal`, preroll **ON** | `14 ± 3` → **[11, 17]** | **`SPARKCOUNT` = 11** | in band, **but the pass is void — §3** |
| **KB3** | `night` | `16 ± 4` → **[12, 20]**, not ≈ 62 | **not yet dumped** | un-run (§7) |
| **KB4** | `interior` | `SPARKCOUNT = 0` | **not yet dumped** | un-run (§7) |

Companion figures the seal §2 requires beside `SPARKCOUNT`, both traversal arms **identical**:
`rawCount` **22**, `popOpen` **22**, `inFrustumOnly` **11**, `uTime_fx` **0.05**,
`fx._t0` 0.542733 (OFF) / 0.826067 (ON), `capacity` 96, `meshVisible` **true**,
`instanceCount` 22, camera `pos [6,14,6] fwd [−0.442,−0.147,−0.885] fov 44 aspect 1.7778`,
`setShot` `{tod 0.77, draws 252, warnings 1}`. Full `aPos`/`aData` in
`fxcluster1/sparkcount-readback.json`, re-derivable without a second boot as seal §7 required.

**Frustum decomposition of the 22 → 11 cut:** 11 in-frame, **7 behind the camera**, 4 off-frame. The
frustum clause is doing all of the work, and it is doing real work — `mesh.frustumCulled = false`
(`:1620`) means without it the count would have been 22.

## 2. Why KB1 failed — the `pop` gate never closed, because `born` is back-dated on every staged shot

The seal §2 gates on `pop = smoothstep(0, 0.22, uTime_fx − born)` and §1 predicted, from
PREREG-fxcluster §0.2's double clock re-base, that a canonical capture leaves
`uTime − born ≈ 0.033` → **`pop ≈ 0.02–0.09`**. That is the entire premise of the visibility gate.

**Measured:** `born = −0.25` for **all 22 markers, on both arms**, with `uTime_fx = 0.05`. So

```
dt = 0.05 − (−0.25) = 0.30  >  0.22   →   pop = 1.0, saturated, for every marker
```

`popOpen` is **22 of 22**. **The `pop` clause rejected nothing.** The seal's mechanism premise does
not reproduce on this build.

`born = −0.25` is not an accident of the clock; it is a signature. `SparkleField.preroll(sec)`
(`:1696`) is defined as *"back-date every live marker's born stamp"*:

```js
preroll(sec) { for (let i = 0; i < this.count; i++) this.aData.array[i * 4 + 2] = -sec; … }
```

`born = −0.25` is exactly `preroll(0.25)` having run.

## 3. The control's treatment does nothing — `preroll` is ungated, against two comments that say it is not

`src/fx/Particles.js:2570-2574`, quoted:

```js
/* PREREG-fxcluster §1 seam (sub-arm B): a staged still captures ~3 frames after the
   SECOND clock re-base (Debug.setShot applies the shot twice), inside the sparkle pop
   window — fires get _prerollFires below; the field had no preroll. Debug-gated OFF by
   default: shipped behaviour is bit-exact unless the capture harness opts in. */
this.sparkles?.preroll(0.25);  // staged shots only by construction (_stageShot); …
```

**The comment says "Debug-gated OFF by default". The call on the next line has no gate.** There is no
`if (debug.sparklePreroll)` anywhere on that path — `grep` over `src/**` finds the flag read nowhere.
`preroll()`'s own docstring (`:1695`) makes the same false claim: *"Inert unless called; **the only
caller is debug-gated** (see `_stageShot`)."*

**Proved from the dump, not inferred.** The runner set the flag correctly and the page confirms it:

| | `prerollFlag` read in-page | `born` | `aPos` | `aData` | camera |
|---|---|---|---|---|---|
| `traversal-prerollOFF` | **`null`** | **−0.25** | — | — | — |
| `traversal-prerollON` | **`true`** | **−0.25** | **identical** | **identical** | **identical** |

The flag differs. **Every instance buffer is byte-identical.** The only fields that differ between
the two arms are `fx._t0` and `engineTime` — wall-clock, not treatment.

**Consequences, stated plainly:**

1. **KB1 is unstageable on this build.** Its arm is not "preroll off"; it is preroll on, mislabelled.
   The seal's decisive control — the only one separating `SPARKCOUNT` from the raw count that would
   have passed CRITIC rounds 1–2 — **cannot be run at all** until the gating is repaired.
2. **KB2's pass is void.** `SPARKCOUNT = 11` sits inside `[11, 17]`, but it is *the same 11* that
   fails KB1, from a byte-identical dump. A pass and a fail cannot be read off one measurement and
   have both mean something. KB1 and KB2 are not two controls; they are one control run twice.
   **This is not reported as a pass.**
3. **It also lands at the very edge:** 11 is the floor of `14 ± 3`. One marker fewer and the arm
   would have failed both bands.
4. **Scope beyond sparkcount, for the coordinator:** if `preroll(0.25)` fires on every `_stageShot`,
   then the comment's "shipped behaviour is bit-exact unless the capture harness opts in" is untrue
   for staged captures, and **every canonical still taken since that line landed has sparkles fully
   popped whether or not any harness asked.** This result does not chase that — it is a `src` matter
   and this runner may not edit `src/**` — but it is flagged where it was found.

## 4. Blob↔marker: a real disagreement, reported as the finding and NOT closed (P-S2)

Seal §0 registers the correspondence as **blob↔marker**, never a numeric identity — §184's units
correction. Measured against the committed pixel figures in `fxcluster1/sparkdiag.json`:

| registered correspondence | pixel path (committed) | instance path (measured) | agreement |
|---|---|---|---|
| traversal `b2-cand` | **236 strict px in 14 blobs**, largest 82 px | **`SPARKCOUNT` 11** (raw 22, popOpen 22, inFrust 11) | **DISAGREE by 3 markers — 11 vs 14** |
| `sbs2/night` post-`skyCut` | **50 px in 16 blobs** | **not yet dumped** | untested |
| known-bad `b2-base` | **0 px / 0 blobs** | **not measurable — see below** | **the registered `0 ↔ 0` could not be tested** |
| `sbs3/night` uncut *(guard)* | **224 px in 62 blobs** | not yet dumped | untested |

**P-S2 binds and is obeyed: the disagreement is the finding. `POP_MIN` stays 0.5.**

**And on this dump no tuning could have closed it, which is worth recording:** `popOpen` is 22/22, so
the `pop` clause is **inert** — *no* value of `POP_MIN` in `(0, 1]` moves the count off 22, and
raising it only ever subtracts. The entire 22 → 11 reduction is the frustum test. **The 11-vs-14 gap
is structural, not a threshold artefact**, so anyone who "fixed" it by moving `POP_MIN` would be
fitting a curve to a number that clause does not control.

**The direction of the disagreement contradicts the seal's declared asymmetry.** Seal §3 declares the
instance path **over-counts** (occluded markers it cannot depth-reject). Measured, it **under-counts**:
11 markers against 14 blobs. Over-counting is the error the seal predicted and accepted; under-counting
by 3 is unexplained by anything the seal registered.

**Caveat, stated rather than smoothed over:** this probe's `traversal` stages its own camera
(`pos [6,14,6] fov 44`) and `b2-traversal.cand.png` was a separate capture. The 11-vs-14 comparison is
therefore *not* frame-matched, and part of the gap may be staging rather than instrument. **That
uncertainty is itself a reason the correspondence is unproven, not a reason to assume it holds.**

**The registered `0 ↔ 0` agreement — the one genuine numeric agreement in the seal — was not tested**,
because the arm that would test it (`preroll` OFF) does not exist on this build (§3).

## 5. Both instruments, quoted together, as the seal requires

Seal §6: *"Any letter quoting one must quote both."* Discharged:

- **Pixel path (`skyCut`) — REGISTERED, AND NOW CONFIRMED AS PRIMARY BY P-S1.**
  `|R−143| ≤ 40 ∧ |G−216| ≤ 35 ∧ |B−255| ≤ 40 ∧ y ≥ skyCut[shot]`, `skyCut = { night: 200,
  traversal: 120 }`. Controls as published: traversal 236 → **236** kept; `sbs3/night` 224 → **50**
  kept / **174 rejected as sky**; known-bad **0 → 0**; `sbs2/night` 50 → **50**; `sbs3/traversal`
  239 → **239**.
- **Instance path (`SPARKCOUNT`) — MEASURED, AND WITHDRAWN.** `traversal` = **11** markers
  (raw 22, popOpen 22, inFrust 11) on both arms. Its decisive control failed; its `pop` clause was
  inert; its treatment was a no-op.

**The known over-count is still declared and still unrepaired** (`depthTest: true`, `:1611`, is a GPU
fact the CPU probe cannot see) — and it is now joined by an unexplained **under**-count of 3. Since
`skyCut` is not being retired, the instrument that sees drawn pixels remains the primary, which is
the arrangement seal §6 was written to protect.

## 6. Does this license replacing `skyCut` as primary? **No. The seal is withdrawn.**

- **`skyCut` stays the registered §2.1-item-6 grammar count.** Nothing in §2.1 changes.
- **`PREREG-sparkcount.md` is withdrawn**, by its own §5, on P-S1. Not paused — withdrawn. §5 says
  *revert, do not defend*, and the fact that the failure traces to an ungated `src` call is **not** a
  licence to keep the seal alive: a seal whose decisive control cannot be staged is not a seal that
  is "nearly right", it is one that was never testable.
- **The raw count stays forbidden** (§184, seal §1). Nothing here softens that. Note the raw count on
  this staging is **22** against 14 committed blobs, so it remains exactly the over-reading §184
  describes.
- **`POP_MIN` was not moved.** It ends at 0.5, as registered, and §4 records that moving it could not
  have helped.

### What any future letter must quote

A successor seal may only re-propose `SPARKCOUNT` as primary if it first fixes the staging, and any
letter must carry **all** of:

1. **That `preroll` is gated** — a `src` change at `Particles.js:2574` putting the call behind the
   `sparklePreroll` debug flag its own comment claims it is behind, **plus a dump showing
   `born` differing between the OFF and ON arms.** Byte-identical `aData` across arms is the
   signature of the defect and must be shown absent.
2. **KB1 — `traversal`, preroll genuinely OFF — `SPARKCOUNT = 0` beside a non-zero `rawCount`**, both
   numbers in the same sentence. `0` is also what a dead instrument returns, so the `rawCount` is not
   optional.
3. **KB2 — preroll ON — within `14 ± 3`**, quoted beside the **14 blobs / 236 px** it corresponds to,
   labelled **blob↔marker, not numeric identity**, and **demonstrably from a different dump than
   KB1's** — the defect this result found.
4. **KB3 — `night` — within `16 ± 4` and not ≈ 62**, beside **16 blobs / 50 px** post-`skyCut` and the
   **62-blob / 224-px** uncut figure it must avoid.
5. **KB4 — `interior` — `SPARKCOUNT = 0`**, which on a 96-capacity buffer is also the check that the
   instrument is not reporting its own capacity.
6. **The §2 companions for every arm** — `rawCount`, `popOpen`, `inFrustumOnly`, `uTime_fx`, `fx._t0`,
   and the `aPos`/`aData` dump — beside `SPARKCOUNT`, never instead of it. **`popOpen` is now
   load-bearing**: `popOpen == rawCount` means the `pop` clause is inert and the gate is decorative.
7. **Both instruments' figures together** (§6), including the declared occlusion over-count **and**
   this result's measured under-count of 3, with the frame-matching caveat from §4 resolved rather
   than repeated.
8. **A frame-matched comparison** — the marker count and the blob count taken from the *same* staging,
   which this run could not do.
9. **The scorer's `state` field reading `SCORED — licensed`**, not merely `licensed: true`.

## 7. Arms still in flight

At writing, the runner is alive and has dumped **2 of 4** arms (`night` and `interior` pending, ~8
min each). **This does not affect the verdict:** seal §4 conditions the licence on KB1 *and* KB2, and
KB1 has failed, so P-S1 has fired and nothing the remaining arms return can restore the seal.

The runner writes each arm to `sparkcount-readback.json` as it lands, so re-running
`node progress/records/fxcluster1/sparkcount-score.mjs` will pick them up with no second boot. The
scorer now reports partial runs as `SCORED — PARTIAL (n/4 …)` rather than as failures — **absent is
not failed** (§8). KB3/KB4 remain worth reading as diagnostics, particularly KB4 against the
96-marker capacity.

**Do not re-launch the runner.**

## 8. Scorer defects found and fixed — reporting only, no registered arithmetic touched

Run as dispatched against the pre-boot file, the scorer printed `CALIBRATION LICENCE: NOT GRANTED`
for **"no data"** — byte-identical to what it prints when KB1 genuinely fails. Those are opposite
outcomes under seal §5 (one withdraws the seal, one withdraws nothing), and at 04:17 the readback
still held `arms: []` because the runner writes its header at `sparkcount.mjs:35` *before* taking the
lock. **The file's existence is not evidence of its contents** — and mistaking one for the other is
§184's own defect, one layer up, in the instrument built to catch it. A second instance appeared once
arms began landing: a *missing* KB2 was being reported as a *failed* KB2.

Fixed, with **`POP_MIN` = 0.5, the smoothstep port, the frustum test and all four KB bands
transcribed unchanged** (seal §5's "no mid-run redesign" respected — no threshold moved):

- **`NO DATA`** — readback absent, or present with `arms: []`. Prints "This is NOT a falsified
  control" and that `skyCut` remains primary.
- **`SCORED — PARTIAL (n/4; not yet run: …)`** — arms landing one at a time. **Absent is not failed.**
- **`P-S5 FATAL`** — arms present, no readable dump.
- **`SCORED — control(s) failed`** — the one that means the seal is in trouble. **This run's KB1 is
  that case**, and it now says so distinctly.

**P-S5 is definitively NOT triggered:** the boot reported
`{hasFx: true, hasSparkles: true, hasPreroll: true, capacity: 96}`.

**Scorer arithmetic verified against 8 synthetic fixtures** before the probe landed —
`fxcluster1/sparkcount-scorer-control.mjs` → `.txt`, following the cluster's `a3`/`a4-scorer-control`
convention. Synthetic: they measure the scorer, not the game. All 8 behave as constructed, including
**F3, a gate-dead detector in which KB1 *must* fail** (so a KB1 pass could not have been automatic),
**F1**, which reproduces §184's near-miss end to end (raw 17 in → `SPARKCOUNT` 0 out), and **F4/F5**,
which show the frustum and `scale` clauses each rejecting alone. **The scorer computes the seal's
predicate correctly — KB1's failure is a fact about the build, not a mis-port.**

## 9. Files created or modified

**Modified:**
- `progress/records/fxcluster1/sparkcount-score.mjs` — §8 reporting fixes (`NO DATA` / `PARTIAL` /
  `P-S5 FATAL` / `SCORED` made distinct) and an optional `argv[2]`/`argv[3]` fixture-path override so
  the arithmetic can be exercised against known-answer dumps. **No registered threshold or arithmetic
  altered.** `node sparkcount-score.mjs` with no arguments behaves exactly as seal §7 specifies.
- `progress/records/fxcluster1/sparkcount-scores.json` — regenerated; now carries `state`,
  `missingArms`, and the KB1/KB2 rows.
- `progress/records/RESULT-fxcluster.md` — pointer stanza appended (seal §8 files the sparkcount
  verdict there; this dispatch names `RESULT-sparkcount.md`). **Written while the probe was still
  queued and now superseded by this file — see §10.**

**Created:**
- `progress/records/RESULT-sparkcount.md` (this result).
- `progress/records/fxcluster1/sparkcount-scorer-control.mjs` / `.txt` — §8 fixtures and output.

**Written by the probe, not by me:** `fxcluster1/sparkcount-readback.json`,
`logs/sparkcount-r1.log` (both still being appended to — §7).

**Read, not modified:** `PREREG-sparkcount.md`, `KNOWN_ISSUES.md` §184, `NOTE-sparkle-predicate.md`,
`fxcluster1/sparkcount.mjs`, `fxcluster1/sparkdiag.json`, `src/fx/Particles.js` (read-only, for the
§2/§3 mechanism).

**Not touched:** `src/**` — registration tree `85bab2d30f5f7b59` verified identical at seal time, at
probe start, and per-arm (`srcAtArm`). No captures; no lock ticket.

## 10. Correction to the pointer already appended in `RESULT-fxcluster.md`

That stanza was written at 04:23, while the probe was still queued, and says *"the sparkcount probe
did not land; nothing is adjudicated."* **It was true when written and is now superseded**: the probe
took the lock at 04:29:18 and KB1/KB2 landed. Per §34 (*a correction lives where the claim lives*),
the correction is applied at that stanza and the original left visible. **The one conclusion that
survives unchanged is the operative one — `skyCut` remains primary** — though it now stands because
**P-S1 fired**, not for want of data.

# RESULT-sparkcount — the probe did not land; nothing is adjudicated and `skyCut` stays primary

**Owner:** FX. **Date:** 2026-08-06. **Seal:** `PREREG-sparkcount.md` (sealed 04:03 the same day).
**Scorer run:** `node progress/records/fxcluster1/sparkcount-score.mjs`, 04:17:49Z and 04:18:54Z.
**No `src/**` edits. No captures taken, no lock ticket drawn.** No git — the coordinator sweeps; §7 lists files.

---

## 0. Verdict in one line

**The probe has not landed.** `sparkcount-readback.json` exists but carries `arms: []` — the runner
wrote its header and has been **waiting for the capture lock ever since**. **No falsifier P-S1–P-S5
is adjudicated, KB1–KB4 are un-run, the calibration licenses nothing, and `skyCut` therefore remains
the registered §2.1-item-6 primary predicate** (seal §6 retires it *only* on KB1+KB2 holding).

**The dispatch's premise "the probe has landed — `sparkcount-readback.json` exists" is false, and the
reason it is false is the finding of this result:** *the file's existence was read as evidence of its
contents.* The runner writes that file at `sparkcount.mjs:35`, **before** `withGame` and therefore
before the lock, the boot, and every arm. Existence proves the runner *started*. It says nothing
about whether it ever measured anything.

## 1. What the probe actually contains, quoted in full

```json
{ "prereg": "PREREG-sparkcount.md", "startedAt": "2026-08-06T04:03:36.391Z",
  "srcTreeBefore": "85bab2d30f5f7b59", "arms": [] }
```

That is the whole file — 130 bytes, four keys, **no `live` key, no `fatal` key, no `finishedAt`, and
an empty `arms`.** Cross-read against `progress/records/logs/sparkcount-r1.log`:

```
[04:03:36 +   0s] seam verify ok (srcTree 85bab2d30f5f7b59)
· waiting for capture lock (10s, held by pid 19148)      <- litwarm1
   …
· waiting for capture lock (134s, held by pid 15982)     <- staging1 takes it at ~134s
   …
· waiting for capture lock (847s, held by pid 15982)     <- still staging1, 14+ min in
```

And the runner is **still alive**: `ps` shows `pid 29232  node sparkcount.mjs`, started 04:03,
alongside `pid 19148 litwarm1.mjs`, `pid 15982 staging1.mjs`, and `pid 5947 combatrecipient.mjs`.

**So the probe did exactly what the seal told it to do.** §7 says "litwarm is running with staging1
and combatrecipient queued — ticket and wait; do not jump". It ticketed and it is waiting. This is
the queue discipline working, not a fault. It simply has not reached the front.

**What did clear:** the seam verify passed and the registration tree is intact —
`srcTreeBefore 85bab2d30f5f7b59`, byte-identical to the tree the seal registered. That is the only
claim this run supports.

## 2. Adjudication — every registered falsifier, against what the probe actually contains

| falsifier | registered trigger | adjudication | why |
|---|---|---|---|
| **P-S1** | KB1 returns non-zero | **UN-ADJUDICATED** | KB1 never ran. No `traversal-prerollOFF` arm exists. |
| **P-S2** | KB2 outside 14 ± 3 | **UN-ADJUDICATED** | KB2 never ran. **No marker↔blob comparison exists to report** — see §4. |
| **P-S3** | KB3 lands near the uncut 62 | **UN-ADJUDICATED** | KB3 never ran. |
| **P-S4** | KB4 non-zero | **UN-ADJUDICATED** | KB4 never ran. |
| **P-S5** | `fx.sparkles` absent or `aData` unreadable **in the boot** | **NOT TRIGGERED — and it must not be recorded as triggered** | P-S5 is a *boot-side* fatal: it fires when the page is up and `fx.sparkles` is missing. **There was no boot.** The runner's own P-S5 branch (`sparkcount.mjs:80-82`) writes `report.fatal` and `report.live`; the readback has **neither key**, which is positive evidence that path was never reached. |

### Every registered band, with the number that stands beside it

The seal §4 bands, transcribed, each paired with the measured value. **The measured column is empty
for every row, and writing anything else in it would be inventing the result:**

| control | arm | registered band | measured | verdict |
|---|---|---|---|---|
| **KB1** | `traversal`, preroll **OFF** | `SPARKCOUNT = 0` while `rawCount ≈ 14–17` | **not measured** | **un-run** |
| **KB2** | `traversal`, preroll **ON** | `SPARKCOUNT = 14 ± 3` → **[11, 17]** | **not measured** | **un-run** |
| **KB3** | `night` | `SPARKCOUNT = 16 ± 4` → **[12, 20]**, and **not ≈ 62** | **not measured** | **un-run** |
| **KB4** | `interior` | `SPARKCOUNT = 0` | **not measured** | **un-run** |

Companion figures the seal §2 requires beside `SPARKCOUNT` — `rawCount`, `popOpen`, `inFrustumOnly`,
`uTime_fx`, `fx._t0`, and the `aPos`/`aData` dump — are likewise **absent for all four arms**. The
scorer's own table printed its header and not one data row:

```
 arm                        raw  popOpen  inFrust  SPARKCOUNT  gate
(no rows)
```

**KB1 — the decisive control — is un-run, and that is the whole reason nothing is licensed.** The
seal §4 is explicit: "The calibration licenses nothing until KB1 and KB2 both hold." Neither has
been evaluated. Not failed — *not evaluated*. Those are different, and §3 is about keeping them so.

## 3. A reporting defect found in the scorer, and fixed — `NOT GRANTED` was overloaded

Run as dispatched, the scorer printed:

```
CALIBRATION LICENCE (seal §4: KB1 AND KB2 must both hold): NOT GRANTED
```

…and wrote `sparkcount-scores.json` with `"arms": {}, "licensed": false`. **That output is correct
about the licence and wrong about the reason, and the wrongness is the dangerous kind.** It is
byte-identical to what the scorer would print if the probe *had* landed and KB1 had *failed* — i.e.
if the visibility gate were broken and P-S1 had fired. A successor reading `licensed: false` would
have no way to tell "the seal was falsified" from "nobody measured anything yet", and the seal's own
§5 makes those opposite outcomes: the first withdraws the seal, the second withdraws nothing.

**This is §184's defect wearing a fourth dress.** §184 is about an instrument that cannot distinguish
*measuring zero* from *measuring nothing* — the raw count read `latched=17 fresh=17` on a staging
whose true sparkle pixel count was 0. Here the *scorer* could not distinguish a measured zero from an
absent measurement. Same failure mode, one layer up, in the instrument built to catch it.

**Fixed in `sparkcount-score.mjs` — reporting only; no registered arithmetic touched.** `POP_MIN`
stays `0.5`, the smoothstep port, the frustum test and the four KB bands are transcribed exactly as
before; §5's "no mid-run redesign" is respected because **no threshold moved**. What changed is that
the three non-scoring outcomes now print and serialise distinctly:

- **`NO DATA`** — readback absent, or present with `arms: []` (this run). Prints
  `NOT GRANTED — reason: NO DATA`, plus "This is NOT a falsified control" and the reminder that
  `skyCut` remains primary.
- **`P-S5 FATAL`** — arms present but no readable dump. Prints "record and stop".
- **`SCORED — control(s) failed`** — arms scored, KB1/KB2 not in band. *This* is the one that means
  the seal is in trouble.

The licence still fails closed in every case. Current output:

```
CALIBRATION LICENCE: NOT GRANTED — reason: NO DATA (readback header present but arms[] empty —
  the runner started and has not yet dumped an arm (it writes the header before taking the capture lock)).
  This is NOT a falsified control. No falsifier P-S1..P-S5 is adjudicated by this run.
  skyCut remains the registered primary predicate (seal §6 retires it only on KB1+KB2 holding).
```

## 3a. What this run *can* establish: the scorer discriminates, verified against fixtures

The probe is unavailable, but the *scorer* is not — and the seal's worry applies to it too. If
`SPARKCOUNT` were mis-ported, a future KB1 pass would be worthless, because `0` is also what a dead
instrument returns. That is checkable offline, today, so it was checked:
`fxcluster1/sparkcount-scorer-control.mjs` → `sparkcount-scorer-control.txt`, following the cluster's
existing scorer-control convention (`a3-scorer-control.txt`, `a4-scorer-control.json`).

**These fixtures are synthetic and measure the scorer, not the game.** No number below is evidence
about Sands of Ra; each is one chosen so the correct output is known in advance.

| fixture | construction | required | got |
|---|---|---|---|
| **F1** | **the b2 defect exactly** — 17 markers, in frustum, `scale > 0`, `dt = 0.033` → `pop ≈ 0.061` | `SPARKCOUNT 0`, KB1 **PASS** | raw 17, popOpen 0, inFrust 17, **SC 0**, PASS ✔ |
| **F2** | 14 markers, `dt = 1.0`, on-screen | `SPARKCOUNT 14`, KB2 **PASS** | **SC 14**, PASS ✔ |
| **F3** | **gate-dead detector** — KB1's arm with the pop gate *satisfied* (`dt = 1.0`) | KB1 **must FAIL** | **SC 17**, **FAIL** ✔ |
| **F4** | frustum clause alone — 10 popped; 3 on-screen, 3 behind camera, 4 off-screen | `SPARKCOUNT 3` | inFrust 3, **SC 3** ✔ |
| **F5** | `scale` clause alone — 10 popped and on-screen, 6 with `scale = 0` | `SPARKCOUNT 4` | inFrust 10, **SC 4** ✔ |
| **F6** | `POP_MIN` half-open boundary — `dt = 0.11` → `pop` **exactly 0.5** | admitted (`≥`) | **SC 12** ✔ |
| **F7** | 62 visible markers — the uncut sky population P-S3 guards against | KB3 **must FAIL** | **SC 62**, **FAIL** ✔ |
| **F8** | arms present, dump `fatal` | state **`P-S5 FATAL`**, distinct from `NO DATA` | as required ✔ |

All eight behave as constructed. **F3 is the load-bearing one:** KB1 *fails* when the pop gate is
satisfied, so KB1 is capable of failing — which is the only thing that makes a future KB1 pass
informative rather than automatic. **F1 reproduces §184's near-miss end to end**: raw 17 in, 0 out,
on markers that are latched, on-screen and scaled. The clause that saves it is the `pop` gate alone.

**This licenses nothing about the game**, and the control says so in its own output. It establishes
only that when the probe lands, the arithmetic applied to it will be the seal's. KB1–KB4 remain
un-run; `skyCut` remains primary.

## 4. Blob↔marker agreement: **not measurable from this run** — stated as measured, which is to say not at all

The seal §0 registers the correspondence to be tested. The pixel side is committed and re-read here
from `fxcluster1/sparkdiag.json`; the marker side **does not exist**:

| registered correspondence | pixel path (committed, `sparkdiag.json`) | instance path (this run) | agreement |
|---|---|---|---|
| traversal `b2-cand` | **236 strict px in 14 blobs**, largest 82 px | **no measurement** | **untested** |
| `sbs2/night`, post-`skyCut` | **50 strict px in 16 blobs**, largest 30 px | **no measurement** | **untested** |
| known-bad `b2-base`, preroll off | **0 px / 0 blobs** | **no measurement** | **untested** — incl. the registered `0 ↔ 0` |
| *(guard value)* `sbs3/night` uncut | **224 strict px in 62 blobs** — the population KB3 must **not** re-acquire | **no measurement** | **untested** |

**P-S2 binds here in its strictest form, and binding it correctly means reporting *no* number.**
P-S2 says: if markers and blobs disagree, report the disagreement as the finding; do not tune
`POP_MIN` to close it. There is no disagreement to report because there is no marker count. **The
one thing P-S2 forbids above all is manufacturing the comparison** — and inventing, estimating, or
back-filling a marker count from the 14/16/0 blob figures would be exactly the curve-fit the seal
§0 was written to refuse. `POP_MIN` remains `0.5`, untouched, and was never a candidate for
adjustment because there was no number to adjust it toward.

## 5. Both instruments, quoted together, as the seal requires

Seal §6: "Any letter quoting one must quote both." Discharged as follows.

- **Pixel path (`skyCut`, `NOTE-sparkle-predicate.md` §4) — REGISTERED AND STILL PRIMARY.**
  `sparkle px = |R−143| ≤ 40 ∧ |G−216| ≤ 35 ∧ |B−255| ≤ 40 ∧ y ≥ skyCut[shot]`, with
  `skyCut = { night: 200, traversal: 120 }`. Controls as published: traversal 236 → **236** kept;
  `sbs3/night` 224 → **50** kept / **174 rejected as sky**; known-bad **0 → 0**; `sbs2/night`
  50 → **50**; `sbs3/traversal` 239 → **239**.
- **Instance path (`SPARKCOUNT`, seal §2) — SEALED, BUILT, NOT YET MEASURED.** Runner and scorer
  exist and are auditable; the registered quantity is
  `#{ i : pop(i) ≥ 0.5 ∧ inFrustum(i) ∧ scale(i) > 0 }`. **It has produced no figure at all.**

**Declared, not repaired, and unchanged by this result:** the instance path **over-counts markers
occluded by geometry** and cannot fix it — `depthTest: true` (`Particles.js:1611`) is a GPU fact the
CPU probe cannot see. That over-count is the standing reason `skyCut` is *retired, not deleted*,
under §6. Since `skyCut` is not being retired today, the cross-check that would catch the over-count
is simply still the primary, and no claim rests on the unmeasured side.

## 6. Does the verdict license replacing `skyCut` as primary? **No — precisely no.**

Seal §6 conditions the replacement on "KB1+KB2 holding". KB1 and KB2 have not been run, so the
condition is not met, and it is not met *for want of evidence* rather than by refutation. Concretely:

- **`skyCut` remains the registered §2.1-item-6 grammar count.** Nothing in §2.1 changes today.
- **The seal is NOT withdrawn.** No falsifier fired. It stands, sealed, awaiting its probe. The
  registration tree `85bab2d30f5f7b59` was re-verified intact at 04:03, so the seal's pre-registration
  is still good against the current `src`.
- **Nothing about the raw count is softened.** `fx.sparkles.count` stays forbidden as a grammar
  count (§184, seal §1). A `latched=17` reading on a 0-pixel staging remains the reason.

### What any future letter must quote

A letter that wants to move `SPARKCOUNT` to primary must carry **all** of the following, and a letter
that quotes fewer is quoting a licence it does not have:

1. **KB1 — `traversal`, preroll OFF — `SPARKCOUNT = 0` beside a non-zero `rawCount`.** Both numbers,
   together, in the same sentence. This is the only control that separates this instrument from the
   raw count that would have passed CRITIC rounds 1 and 2; a KB1 pass reported without its `rawCount`
   proves nothing, because `0` is also what a dead instrument returns.
2. **KB2 — `traversal`, preroll ON — `SPARKCOUNT` within 14 ± 3**, quoted **beside the 14 committed
   blobs / 236 strict px** it corresponds to, and labelled **blob↔marker, not a numeric identity**
   (seal §0; §184's units correction).
3. **KB3 — `night` — `SPARKCOUNT` within 16 ± 4, and demonstrably not ≈ 62**, quoted beside
   **16 blobs / 50 px post-`skyCut`** and the **62-blob / 224-px uncut** figure it must avoid.
4. **KB4 — `interior` — `SPARKCOUNT = 0`.**
5. **The §2 companion figures for every arm:** `rawCount`, `popOpen`, `inFrustumOnly`, `uTime_fx`,
   `fx._t0`, and the `aPos`/`aData` dump — reported *beside* `SPARKCOUNT`, never in place of it.
6. **Both instruments' figures together** (§6), including the explicit restatement that the instance
   path **over-counts occluded markers and that this is declared, not a defect to repair**.
7. **The scorer's `state` field reading `SCORED — licensed`** — not merely `licensed: true` — so that
   a `NO DATA` run can never be mistaken for a pass. See §3.

## 7. Files created or modified by this run

**Modified:**
- `progress/records/fxcluster1/sparkcount-score.mjs` — two changes, **neither touching registered
  arithmetic** (`POP_MIN` = 0.5, the smoothstep port, the frustum test and the four KB bands are all
  transcribed unchanged): (a) §3 reporting fix, making `NO DATA` / `P-S5 FATAL` / `SCORED` distinct;
  (b) optional `argv[2]`/`argv[3]` fixture-path override so the scorer can be exercised against
  known-answer dumps (§3a). Defaults are the real files, so `node sparkcount-score.mjs` with no
  arguments behaves exactly as the seal §7 specifies.
- `progress/records/fxcluster1/sparkcount-scores.json` — regenerated by the scorer runs; now carries
  `state: "NO DATA"` with `why`, `startedAt`, `runnerFatal`, `live`, `finishedAt`.
- `progress/records/RESULT-fxcluster.md` — short pointer stanza appended, because seal §8 files the
  sparkcount verdict there while this dispatch names `RESULT-sparkcount.md`. The pointer carries the
  verdict in summary and refers here; it does not duplicate the detail.

**Created:**
- `progress/records/RESULT-sparkcount.md` (this result).
- `progress/records/fxcluster1/sparkcount-scorer-control.mjs` — §3a synthetic fixtures.
- `progress/records/fxcluster1/sparkcount-scorer-control.txt` — its output, 8/8 as constructed.

**Read, not modified:** `PREREG-sparkcount.md`, `KNOWN_ISSUES.md` §184,
`NOTE-sparkle-predicate.md`, `fxcluster1/sparkcount.mjs`, `fxcluster1/sparkcount-readback.json`,
`fxcluster1/sparkdiag.json`, `logs/sparkcount-r1.log`, `src/fx/Particles.js` (read for seam
verification only).

**Not touched:** `src/**` (registration tree `85bab2d30f5f7b59` verified intact); no captures; no
lock ticket drawn — `sparkcount.mjs` pid 29232 already holds the queue position from 04:03 and this
result did not disturb it.

## 8. The one action that finishes this

**Do not re-launch the runner.** Pid 29232 is alive and correctly queued behind `staging1` (pid
15982), with `combatrecipient` (pid 5947) also in the queue. A second launch would take a second
ticket and jump nobody. When it reaches the front it will boot, stage the four arms, and write the
dump — at which point `node progress/records/fxcluster1/sparkcount-score.mjs` scores it offline with
no second boot, exactly as seal §7 designed, and §§2/4/6 of this result are replaced by measured
numbers.

**Until then this result stands as written: the seal is intact, the probe is pending, `skyCut` is
primary, and no number has been claimed.**

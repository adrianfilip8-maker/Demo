# PREREG-staging2 — the `guard` camera re-run: staging1's lever, a settled boot, and four instrument repairs

Successor to `PREREG-staging1.md`, which is **VOID** (`RESULT-staging1.md`). Same shot, same owner,
same lever, same two vectors. What changes is the capture protocol and four instruments, each
change caused by something staging1 measured.

---

## 0. PROVENANCE — what I had already seen when I wrote this, and which bands are therefore not independent

**Required disclosure (coordinator decision, §147's amendment form).** This seal was written *after*
scoring staging1. Pretending otherwise, or handing the numbers to someone else to re-derive blind,
would be worse for the record than saying so. So:

**What I had seen:** every quantity in `RESULT-staging1.md` §5 for all four arms (P1–P6, warm-pixel
counts and medians, dense-mass top rows), the P-F4 diff (389,975 px), the base-vs-`sbs3` and
restore-vs-`sbs3` diffs, the 16×12 block map of where base and restore diverge, the per-arm
corner-NBC shares, and the `geocert.mjs` runs. **All of it came from a VOID capture** — P-F3 and
P-F4 both fired, so none of it is a result and none of it is quoted here as one.

| band / choice | independent of staging1? | why |
|---|---|---|
| **P1** [70, 100] | **YES** | unchanged from staging1, set before any frame existed |
| **P2** [560, 720] | **YES** | unchanged |
| **P3** [0, 70] | **YES** | unchanged |
| **P5** [26, 55] | **YES** | unchanged |
| base gates (guard-mass medL [17.5,19.8], pool [108,119]) | **YES** | unchanged; anchored on committed `sbs3`, and they are what caught the void |
| P-F4 [0, 0], P-F6 ±12 px | **YES** | unchanged |
| **KBmid** (west 1.00 m) monotonicity | **YES** | west 1.00 m **has never been captured**; its prediction comes from the AABB model in `NOTE-combatguard-staging.md` §3, not from data |
| **P4 upper bound** 14,000 → **22,000** | **NO** | staging1's candidate read 13,729 against a 14,000 ceiling. I am widening a bound I watched nearly break. §4.2 gives the non-data reason it should never have been 14,000 and re-derives it from the rect's area. |
| **P6 retired** | **NO** | retired because staging1 showed the rect median cannot move (23.19 → 23.36) while the warm half moved 795 → 13,729 |
| **P-F5 re-formed** (per-row continuity) | **NO** in anchors, **YES** in form | the form is derived from what the falsifier was *for*; its anchors are contaminated and are REPORTED, not gated |
| **corner-NBC** (residual-corner share) | **NO** | measured on the void arms; enters as a **REPORTED** quantity only, gates nothing |

**Rule applied throughout: anything I could leave unchanged, I left unchanged**, because an
unchanged band written before the data is still independent of it. Only four things move, each is
listed above, and each says why.

---

## 1. The lever — identical to staging1

`src/core/Shots.js`, `SHOTS.guard`, translated −1.75 m on x only, position and target together:

| | shipped | candidate |
|---|---|---|
| `pos` | `[-11.5, 2.6, 30.5]` | **`[-13.25, 2.6, 30.5]`** |
| `target` | `[-17.0, 1.1, 28.0]` | **`[-18.75, 1.1, 28.0]`** |

`fov` 38, `tod` 0.10, `player`, `roll` — all unchanged. The rationale is unchanged and is in
`PREREG-staging1.md` §1; it is not restated.

**The framing-invariance property is no longer a prediction — staging1 confirmed it on delivered
frames** and it is retained as a gate (P-F6). All four arms put the solved stand at exactly
`camPos + Δ` and the projected figure at **(843.9, 625.3) / (863.6, 244.3)**, identical to a tenth
of a pixel across a 4 m camera translation.

---

## 2. Protocol repairs

### 2.1 A discarded preroll stage before arm 1 (the whole fix for the void)

staging1's `base` was the first scored stage of the boot. It took **454 s** against 249 / 226 /
253 s for the others, differed from committed `sbs3/guard.png` by **41.99%**, and was contradicted
by `restore` — the same camera, later in the same boot — which reproduced `sbs3` to **2.74%**. The
extra ~200 s is shader compilation and texture prewarm landing inside the scored frame. The settle
(10 frozen frames + a throwaway capture) is sufficient for later stages and not for the first.

**staging2 stages `guard` once, settles it, captures it, and throws the frame away before any arm
is scored.** The discarded frame is still written to disk as `guard.preroll.png` so the repair can
be audited rather than trusted.

**This is the second independent reason to distrust a boot's first arm** (a4's repair is the first;
the coordinator records it as §185). **§185's implication is a live question, not a claim, and this
run answers it:** the RESULT must report whether the first-arm wall-time signature reappears — i.e.
whether `preroll` now absorbs the ~200 s and every scored arm lands in a tight band. Per-arm
wall-time is recorded for exactly this.

### 2.2 §186 ordering — stated, and vacuous here

§186 requires `acquire → install → boot → capture → revert → release`. **staging2 performs no
on-disk install at all**, so the hazard §186 exists to prevent cannot occur:

`Debug.setShot()` returns the live `SHOTS[name]` object (`Debug.js:78`, returned at `:143`) and
`applyShot()` re-reads `.pos`/`.target` on every call, so the arms are runtime mutations of that
object. Actual order: **acquire → boot → (install-in-page → capture) per arm → revert-in-page →
release**. `src/core/Shots.js` is never written; `srcTree` before and after must be identical
(staging1: `85bab2d30f5f7b59` both, `same=true`, and that is re-asserted here as a gate). The
in-page table is restored to the shipped vectors inside the hold before the harness releases.

### 2.3 One boot, asserted rather than assumed

All scored arms must carry the same `bootId`. The runner is per-arm resumable, so a rollback
mid-run would otherwise silently produce a cross-boot comparison. **Arms with differing `bootId`
⇒ VOID** (P-F8).

### 2.4 Arm order, chosen for rollback resilience

`preroll(discard) → base → cand → restore → KBmid → KBover`

`restore` sits immediately after `cand` so that P-F4 brackets exactly the window the verdict
depends on (base → cand → restore). If a ~45-minute rollback truncates the run, the gated
comparison and its determinism check survive intact and only the calibration arms are lost — which
downgrades the run to "uncalibrated" rather than to void.

---

## 3. Arms

| arm | pos | target | role |
|---|---|---|---|
| `preroll` | shipped | shipped | **discarded**; absorbs first-stage compile |
| `base` | `[-11.5, 2.6, 30.5]` | `[-17.0, 1.1, 28.0]` | reference; also the under-move known-bad |
| `cand` | `[-13.25, 2.6, 30.5]` | `[-18.75, 1.1, 28.0]` | west 1.75 m — the candidate |
| `restore` | shipped | shipped | P-F4 determinism |
| `KBmid` | `[-12.5, 2.6, 30.5]` | `[-18.0, 1.1, 28.0]` | west 1.00 m — **graded** calibration |
| `KBover` | `[-15.5, 2.6, 30.5]` | `[-21.0, 1.1, 28.0]` | west 4.00 m — over-move |

---

## 4. Registered quantities

Conventions unchanged and restated (§122.1): `L = 0.2126R + 0.7152G + 0.0722B` on 0–255 sRGB bytes;
**NBC = `L < 72 AND (B − R) > +12`**; **warm = `(B − R) < 2`**; differing px at `ΣRGB ≥ 4`;
1280×720. Figure rect **(820, 244, 900, 625)**; figure column **(800, 244, 930, 625)**.

**Base gates (P-F3 — VOID, not FAIL) — unchanged, and they earned their keep:**

| gate | band | `sbs3` anchor |
|---|---|---|
| guard-mass rect (790,100,980,330) medL, **base arm** | [17.5, 19.8] | 18.64 |
| doorway pool (220,360,640,560) medL, **base arm** | [108, 119] | 113.46 |
| solved figure feet / head px y, **every** arm | 625 ± 12 / 244 ± 12 | 625 / 244 |

| id | quantity | band (cand) | independent? |
|---|---|---|---|
| **P1** | figure-column NOT-NBC share, rect (820,244,900,625) | **[70, 100]** | YES |
| **P2** | dense-mass top row: topmost py of the contiguous ≥60%-NBC row block in x ∈ [800,930] reaching py 719 (720 = absent) | **[560, 720]** | YES |
| **P3** | NBC share of the lower-right quadrant (640,360,1280,720) | **[0, 70]** | YES |
| **P4** | warm-pixel count in the figure rect | **[2500, 22000]** | **NO** (§4.2) |
| **P5** | warm-pixel medL in the figure rect | **[26, 55]** | YES |
| ~~P6~~ | ~~figure-rect medL~~ | **RETIRED** (§4.1) | — |
| **P7** | **per-row continuity** — of the 39 ten-px row bands spanning py 244…625 in x ∈ [800,930], the count whose NOT-NBC share is **< 40%** | **[0, 4]** | form YES, anchors NO |
| **P-F4** | `restore` vs `base` differing px, frame-wide | **[0, 0]** | YES |
| R1–R3 | cone air column medL; guard-mass rect medL; frame-wide NBC % | reported | — |
| **R4** | **corner-NBC**: NBC share of (1039,557,1279,719) | **reported, gates nothing** | NO |
| R5 | per-arm wall-time (the §185 question) | reported | — |

### 4.1 Why P6 is retired rather than re-banded

P6 was figure-rect **median** luma, banded [26, 70] against a base of 23.19. It could not have
moved: the plinth pixels it was supposed to lose sit at medL ≈ 21, and the guard's ink outlines and
shadowed flank — which replace them — sit at about the same value. The median of the whole rect is
blind to the change by construction. The signal lives in the warm half, which **P4 and P5 already
measure** and which both moved decisively. Re-banding P6 would be fitting a band to a quantity that
does not carry the claim; it is deleted.

### 4.2 Why P4's ceiling moves, and the non-data reason it should never have been 14,000

Disclosed as non-independent in §0. The reason is not "13,729 was close to 14,000" — it is that
**14,000 was never derived from anything.** The figure rect is 80 × 381 = **30,480 px**. A standing
humanoid fills roughly 40–50% of his own bounding rect, so ~12,000–15,000 warm px is the *expected*
reading, not the ceiling. What the ceiling must exclude is the rect filling with **warm lit paving**
instead of a guard, which would read ≳ 85%. **22,000 px = 72% of the rect** sits above any
plausible figure and below any plausible floor-fill, and P5 (warm medL ≤ 55) independently excludes
lit paving, which is far brighter. Two bounds, one failure mode.

### 4.3 Calibration — a graded stimulus, which is stronger than the binary one that failed

staging1's KB required `KBover` to drive P3 below 15 and it returned **28.58**, because at 4 m west
the lower-right quadrant fills with **unlit courtyard floor**, which satisfies NBC exactly as the
plinth does. That was the risk staging1 §2.1 registered in terms, and it materialised. The lesson
is not "pick a different threshold" — it is that **"dark foreground framing element" is not a
luminance quantity** and my instrument cannot see it.

So the calibration changes shape. **KBmid at west 1.00 m** is a stimulus of known intermediate
strength: the AABB model in `NOTE-combatguard-staging.md` §3 puts the figure ~44% visible there,
between base's ~15% and cand's ~100%. **This arm has never been captured**, so the prediction is
independent of everything I have seen.

- **P-F2 (calibration):** the arms must order **strictly monotonically** on P1 and on P2:
  `P1: base < KBmid < cand ≤ KBover` and `P2: base ≤ KBmid < cand`, with **KBmid strictly inside
  the open interval (base, cand) on P1 by ≥ 10 points at each end.**
- A metric that returns a graded response to a graded stimulus has a *scale*, which is what §13
  asks for and what a pass/fail known-bad never demonstrated.
- **If KBmid does not land strictly between, the calibration fails ⇒ UNSCOREABLE** — no verdict in
  either direction, exactly as before.
- `KBover` is retained but **carries no gate**. Its corner-NBC (R4) is reported so the over-move end
  of the range is on the record; staging1 showed the instrument cannot adjudicate it and this seal
  does not pretend otherwise.

### 4.4 P-F5 re-formed as P7, a per-row continuity test

staging1's P-F5 asked for "no connected NBC mass ≥ 5% of frame touching an edge" and fired on the
candidate for two masses that inspection showed were **not** occluders: the dark doorway *behind*
the guards and shadowed paving. A night frame has several large dark connected things by design;
the falsifier's *form* did not match its *intent*.

The intent was: **nothing may cut the subject.** P7 measures that directly and per-row, so a mass
that eats his legs cannot be averaged away by a bright head — which is precisely how the shipped
frame reads "fine" on any global statistic. A true depth test was considered and rejected: the
render depth buffer is not exposed, COLLISION's BVH holds proxies rather than the cornice that
actually occludes, and my own AABB model **under-predicted the residual by 10×** (predicted 3.4%,
delivered 33.4% corner-NBC). An instrument that wrong has no business gating anything, so the
near-field claim is dropped rather than dressed up.

---

## 5. P-falsifiers — revert, do not defend

- **P-F1** any gated band (P1–P5, P7) outside on `cand` ⇒ **candidate not shipped.** No retune.
- **P-F2** KBmid not strictly between base and cand on P1/P2 ⇒ **UNSCOREABLE.**
- **P-F3** a base gate out ⇒ **VOID.**
- **P-F4** `restore` ≠ `base` at 0 px ⇒ **VOID** (this is the check that caught staging1).
- **P-F6** `cand` figure feet/head more than ±12 px from (625, 244) ⇒ verdict **WITHHELD**, rects
  re-anchored, re-seal.
- **P-F7** any arm's `armTook` false (camera not at the arm's value to <1e-4) ⇒ that arm VOID.
- **P-F8** scored arms not all carrying the same `bootId`, or ~~`srcTreeBefore ≠ srcTreeAfter`~~
  **`srcTreeAtLock ≠ srcTreeAtRelease`** ⇒ **VOID.**

  > **AMENDED 2026-08-06 at this site, §192.1. Read the next paragraph before the amendment: it
  > does NOT rescue run r9, which is VOID and is being re-run.**
  >
  > Run **r9 fired this falsifier and stands VOID** — `srcTreeBefore` `9fb6101f27556a12` ≠
  > `srcTreeAfter` `4c83af2068ab9936`. The condition as registered was met, the registered
  > consequence is VOID/re-run, and it applies. I am not reinterpreting a criterion after seeing
  > the frames (§141.1); the amendment below governs the **re-run only**.
  >
  > **Why the clause was defective.** Both hashes were taken **outside the held lock** —
  > `srcTreeBefore` at process construction, `srcTreeAfter` after `withGame` had already released.
  > On a FIFO that runs 20–60 minutes deep, that window is dominated by *other* runners installing
  > and reverting their arms. In r9 the `before` reading was combatrecipient's `kbside` arm
  > (independently corroborated: `litwarm1`, launched in the same second, recorded the identical
  > `9fb6101f27556a12`), and `4c83af2068ab9936` is base — the tree this boot actually rendered,
  > recorded independently by `litwarm1` at 08:23 and by this run at 13:15. **Nothing drifted while
  > staging2 was rendering**, and the run's own finer `treeDrift` read `false` throughout.
  >
  > This is §192's defect inside a sealed falsifier: a check that names *"the tree this capture
  > rendered"* but reads *whatever was on disk when my process happened to start and finish*.
  >
  > **The amendment is a narrowing, not a loosening.** `srcTreeAtLock` and `srcTreeAtRelease` are
  > both sampled **while this process holds the lock**, so the clause now asks exactly the declared
  > question — *did the tree move while I had exclusive access?* — and a genuine mid-render edit
  > still VOIDs. What it no longer does is void a run because a sibling was mid-arm during the
  > queue wait, which the capture cannot see and which cannot reach its frames. `srcTreeBefore`/
  > `srcTreeAfter` are retained and still reported as `sameTreeOutsideLock`, since queue-wait drift
  > is worth observing even though it is not a falsifier.
- **P-F9** the `preroll` frame is *absent* ⇒ VOID (the repair under test did not run).

---

## 6. §17 look-change declaration

Unchanged from `PREREG-staging1.md` §4 and carried verbatim by reference: the lower-right near-black
mass shrinks and stops crossing the subject; his ground contact becomes visible; his projected size
and screen position do not change at all; the west peristyle background comes 1.75 m nearer and
grows ~15–20%; `tod`, `fov`, `roll`, exposure, player and all materials untouched; blast radius is
two array literals inside `SHOTS.guard` and nothing else.

**One correction to that declaration, from staging1's delivered frames:** it predicted a residual
dark corner of ~3.4% of frame so §7.3's "dark foreground framing element" checkbox kept a tenant.
Delivered corner-NBC was **33.4% of that bbox against base's 91.9%** — the plinth's real silhouette
falls far shorter than the AABB model allowed. Foreground framing in the candidate is carried by the
pale column at the left edge and the shadowed paving, not by the plinth. **Whether that satisfies
§7.3 is a CRITIC judgement, not a measurement, and this seal makes no claim on it.**

---

## 7. Capture plan

One boot, six stages, `guard` only. Runner `progress/records/staging2.mjs`, launched detached via
`bash tools/launch.sh` with an absolute log path; the harness's `withGame` takes and releases the
FIFO ticket. Frames + readback land incrementally in `progress/records/staging2/`. Scoring is
separate: `node progress/records/staging2-score.mjs`, which self-calibrates against committed
`sbs3/guard.png` before it is allowed to score anything and **exits 2 if it cannot reproduce the
anchors** (two implementations disagreeing is the §122.1 hazard).

Queue ahead of this run: litwarm, sparkcount, combatrecipient. Expected ~21 min of boot once the
lock is held (6 stages × ~250 s), plus queue.

---

## 8. Decision table

| outcome | action |
|---|---|
| P-F3 / P-F4 / P-F8 / P-F9 | VOID, re-run |
| P-F7 on any scored arm | that arm VOID |
| P-F6 | verdict WITHHELD, re-anchor, re-seal |
| P-F2 (KBmid not between) | UNSCOREABLE — no verdict either way |
| any of P1–P5, P7 out on `cand` | candidate **not shipped**; report which and by how much |
| all gates in band, P-F4 = 0, KBmid strictly between | **SHIP** the two vectors; `KNOWN_ISSUES` entry; and the cone's §183 re-judgement runs against `staging2/guard.cand.png` with `PLINTH_Y → 720` |

---

## 9. Files of this seal (coordinator sweep list — no git run by this task)

- `progress/records/PREREG-staging2.md` (this file)
- `progress/records/staging2.mjs`, `progress/records/staging2-score.mjs`
- `progress/records/staging2/` (frames, `readback.json`, `run.log`, `score.json`)

No `src/**` edits, no git, no lock outside the runner's own `withGame` hold.

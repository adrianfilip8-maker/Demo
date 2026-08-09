# RESULT-celband run 1 — **VOID on provenance**, and the void is the finding

Run against `PREREG-celband.md` and its two pre-capture amendments. Arms: `shots/celband/{a0,a1}`,
log `logs/celband.log`, scorer `tools/celbandscore.mjs` on `gate.mjs`, fail-closed.

```
==> DO NOT SHIP — A0b sameTree FAIL; armTook, C1, C2, P1, P2, P4, S2, S3 all VOID
```

**Nothing ships. `celband` remains inert** (`celbandArm()` returns null on the default path, the
committed blob is unchanged, and `tests/textures.test.mjs` is the check on that, not this file).

---

## 1. Why it is void: the arms are three commits, not three arms

`shot.mjs` takes the FIFO lock once per invocation, so three environment-variable arms are three
separate runs that queue independently. With four agents committing every few minutes, the tree
moves between them. It did:

| arm | captured | commit | `hero` windows |
|---|---|---|---|
| A0 control | 18:48 → 19:05 | **212b454** | 207 |
| A1 treatment | 19:05 → 19:41 | **9bd617d** | 195 |
| A2 calibration | never ran — stopped, see §4 | — | — |

Twenty commits separate them, and they include **`src/core/Shots.js`** — the D4 hero re-framing,
whose own commit message says *"the hero is grounded and 1.8× larger"* — and **`src/world/Statues.js`**
(+218 lines, the D9 rework). A camera change alters which pixels are in frame, which is the input
to every statistic in this seal. The changed window count is the visible trace of it.

So the A1 − A0 difference is a mixture of this texture stage and twenty commits of four other
agents' work, and **no split of it is available from these files.** That is a defect in the run,
not a result about the candidate. VOID is not FAIL and it is certainly not PASS.

§28 recorded the within-boot version of this — *"every within-boot A/B in this project was captured
at a different world clock"*. This is the across-boot version and it is strictly worse, because a
commit between arms can move the camera. `celbandscore.mjs` now carries **`sameTree`** as a guard
ahead of the calibration: every arm must report one `report.json` commit sha or the run is void
before a statistic is read. It is the guard this run needed and did not have.

## 2. The one guard that could be evaluated failed, and it is the same lesson one level up

**C2 — the control must reproduce the baseline the seal registered — FAILS, and would have failed
even with perfect arm hygiene.**

```
hero, frame-wide flat share:   shots/r9  0.1549      A0 control  0.1914      |Δ| 0.0365
                               registered bar: |Δ| <= 0.010
interior:                      shots/r9  0.1377      A0 control  0.1838
```

`shots/r9/` is 2½ hours and ~120 commits old. **Every absolute threshold in §5 of the seal was
derived from it, and by the time the control was captured none of those baselines existed any
more.** P1's bar of 0.2016 was "closes ⅓ of the gap from 0.1549"; the frame had already travelled
half that distance on its own.

This is not a near miss to be waved through — it is the same failure as §1 at the scale of a whole
seal. **In a repo with four concurrent agents, a pre-registration that pins absolute bars to a
stored capture is stale before it is scored.** The bars have to be registered as *deltas against a
control captured in the same run*, and the control has to be captured first.

The thresholds are **not** being restated against the new baseline. §141.1: never move a threshold
after seeing the candidate. Run 2 gets a new seal.

## 3. What the numbers say descriptively — reported, licensed as nothing

Stated only because refusing to report measurements you dislike is its own failure mode. Every
number here is contaminated per §1 and none of it licenses a change.

| | A0 control | A1 treatment | Δ | reference |
|---|---|---|---|---|
| `hero` flat | 0.1914 | **0.2653** | +0.0739 | 0.2950 |
| `hero` grad p50 | 1.22 | **1.27** | **+0.05** | 0.30 |
| `hero` top3 p50 | 0.281 | 0.309 | +0.028 | 0.337 |
| `interior` flat | 0.1838 | **0.2737** | +0.0899 | 0.2950 |
| `interior` grad p50 | 1.33 | **1.24** | −0.09 | 0.30 |
| `interior` top3 p50 | 0.271 | 0.335 | +0.064 | 0.337 |

Two things are worth carrying into run 2 as *hypotheses*, not results:

- **The registered forecast was right in direction.** §7a predicted `interior` would move more than
  `hero` in flat share, on the grounds that `RESULT-grain1` measured it as the one surface where the
  composite grain was **not** the dominant noise source. It moved more: +0.0899 against +0.0739.
- **Falsifier 2 may have fired on `hero`.** The seal registered *"A1 raises `G` → the lattice is
  converting noise into step-flicker at frame scale, and the operator is wrong even if `F`
  improves."* `hero`'s gradient went **up** (1.22 → 1.27) while `interior`'s went down. If that
  survives a clean run it is a real refutation of half the mechanism, and it is the same shape as
  the offline finding already recorded in `Canvas2D.celband`'s header — quantising raw luma took the
  albedo's gradient 5.02 → 5.22. Note that P2's registered bar (≤ 1.2713) would have scored **PASS**
  on 1.27 while the treatment was *worse than its own control*. A stale absolute bar can pass a
  candidate that a same-run delta would fail. That is the third face of §1 and §2.

## 4. A2 was stopped deliberately

The calibration arm was queued behind three other agents' tickets and would have been captured at a
fourth commit. Running it would have bought an hour of exclusive FIFO hold and a number that was
already void. It was killed rather than run, and the seal's C1 is recorded VOID — which forces
every downstream guard to VOID in the scorer, exactly as registered.

## 5. What run 2 must do differently

1. **One boot, all arms.** The machinery exists and needs no new switch: `Canvas2D.abRaw()` reads
   `globalThis.__TEX_AB` **per call, never latched** — its header says so and says why — and
   `Textures._prewarmParallel` ships the arm string with every worker job, so a runner can set the
   arm, flush the texture cache, re-prewarm and shoot again inside one page. That is
   `tools/shadowhold.mjs`'s shape applied to textures, and it removes the commit gap by
   construction.
2. **Register deltas, not absolutes.** Every bar as `A1 − A0` measured in the same run. A stored
   capture may be quoted for context and must not be a threshold's denominator.
3. **Capture the control first and check it before proceeding**, so a stale seal is caught for the
   price of one shot rather than three.

## 6. What survived, and it is most of the work

The seal, the two instruments and their calibration are unaffected by the void — none of them
depends on these frames:

- `celsurf.mjs` reproduces critic 9's frame-wide flat statistic on five of its published numbers.
- `celtex.mjs` measures the albedo, offline and lock-free, and it is where the parameters were
  derived, the invariants checked (`darkTail` unchanged on eight of nine recipes; `jointSign.dY`
  negative on all six masonry recipes), and D7 refuted as an authoring defect (§271.2).
- `Canvas2D.celband` is committed, inert, and verified bit-identical on the default path.

The offline half of this work stands. Only the frame half is void.

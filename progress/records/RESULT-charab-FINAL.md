# RESULT-charab-FINAL-r1 — the first final round: VOID by C-F3, re-run ordered

## The round as run (seed 8, key committed before the spawn)

| pair | A | B | letters | by model |
|---|---|---|---|---|
| sly-closeup | base | model3 | A,A,B,A | incumbent 3 — rebuild 1 |
| sly-profile | model3 | base | A,B,A,B | 2 — 2 |
| sly-perch | model3 | base | B,A,B,B | incumbent 3 — rebuild 1 |
| traversal | base | model3 | A,A,A,A | incumbent 4 — rebuild 0 |

Raw translation: **incumbent 12, rebuild 4** (the critic's own by-build regrouping, "12–4",
matches the key — eighth consecutive verified blinding). By question, regrouped: identity 3–1
incumbent, silhouette 3–1 incumbent, fidelity 3–1 REBUILD, craft 3–1 incumbent.

## Why the round is VOID — the seal's own clause, quoted

PREREG-charab C-F3, verbatim: *"Both arms capture through `step(n, 0)`. If a frame is produced by
any path that advances the world clock (`grab()`, `setShot`'s live steps), that shot is
**UNSCOREABLE** for silhouette comparison (§28/§195)."* Outcome table: *"C-F1 or C-F3 fires →
**VOID**, re-run."*

`charab.mjs` calls `window.__GAME.setShot(name)` with **no dt argument**. §195 established that
`setShot` runs seventeen frames at LIVE dt internally — so every frame in every round was staged
through a clock-advancing path. The defect is **asymmetric between arms**: each arm is its own
boot, so the two models are captured at different idle-animation phases. This is not a
technicality; it is visible in the verdict text. The critic describes, on the rebuild:

- "a bare gold hook hovering in mid-air with no shaft" — hook and shaft are ONE rigid tube strip
  on one bone; only a pose can hide the shaft behind the body;
- "~7 heads" in profile — the same mesh measured 5.3–6.1 heads in r2/r3/r5;
- a tail "thin at the root and fattest in the middle" — the taper is monotonic from the root.

Those are descriptions of an unflattering idle-phase pose, not of the geometry. The same lottery
cut the other way in earlier rounds. **C-F3 was written for exactly this and it fires.**

**Scope of the fire, stated honestly:** every prior round shares the same staging path, so C-F3's
letter reaches r1–r7 too. Those rounds are already-consumed iteration guidance — their work lists
drove stages 3–8 and are not being re-litigated — but **no shipping decision may rest on any of
them**, which is one more reason the final must be clean. The 15–1s and this 12–4 are equally
phase-contaminated; the clean final supersedes them all.

## The re-run (this file's second half will record it)

`charab.mjs` now passes `{ dt: 0 }` to `setShot` (the option §195's fix added to Debug.js). Both
arms re-render — base AND model3 — so the deciding frames are phase-free on both sides: same
canonical staged pose, no idle-phase advance, C-F3 satisfiable for the first time. Then seed-9
pairs, key before round, one fresh critic, and PREREG-charab §6 applied to THAT round.

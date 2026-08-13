# RESULT-torchlight — VOID capture (PF3+PF4), and the value does not ship (PF1): the drift control caught the stale-manifest resume, and the "seventh sconce" is the guard's own torch

Scored against `PREREG-torchlight.md` per its registered outcome branches. Run 4 (runs 1–3:
launch/lock casualties, §298.3-family). Frames archived at
`progress/records/torchlight1-void-run4/`; scorer log
`progress/records/logs/torchlight-score-run4.log`.

## Scoreboard (registered branches, in the seal's own terms)

```
BG1 PASS · P1 PASS · P2 PASS · KO1 PASS · R1 PASS · V2 PASS · V3 PASS · V4 PASS
POOL: ΔmeanL +24.3, Δ(R−B) +92.4, warm% 2.3 → 89.2   KO dose: 39.8@6.0 vs 24.3@2.5 (×1.64)
D1  FAIL — boot A2 vs boot A: interior 49,417 px, hero 80,102 px (bar [0,0])
    ⇒ PF4: every cross-boot [0,0] bar VOID → B1–B15 VOID (all printed 0 px), N1 VOID
F1  FAIL — FAR ΔmeanL +2.24 (in band) but Δ(R−B) +12.06 vs band [−8,+2.5]
    ⇒ PF1: the value 2.5 does NOT ship
V1  FAIL — interior slot (9.09, −8.78, −66.57) matches no registered sconce
    ⇒ PF3: capture VOID, re-run after diagnosis
OUTCOME: VOID capture; no verdict on the candidate; registered fallback applies —
         TUNE.localToon 2.5 → 0.0 (mechanism stays, term off) until a valid PASS exists.
```

## Diagnosis 1 — D1: one run is not one session

Boot A's base frames were captured 02:41–03:57; the container restart killed the runner; the
relaunch **resumed from the manifest** and reused those frames as the base reference for
boots A2/B captured 05:30–06:45. D1 exists precisely to catch this and did: ~3 h of §296-f3
luma drift flips tens of thousands of pixels at |d|≥1. §296's "one boot ≠ one tree" gains a
sibling: **one run ≠ one session — a manifest resume across a container restart silently
converts same-tree bars into cross-session bars.** The resume feature saved 65 minutes and
cost the run.

## Diagnosis 2 — V1/F1 share a root: the guard's carried torch is a seventh underground emitter

`Guard.js:1479` registers ONE `addLocalLight` handle for the guard nearest the camera. The
interior staging's guard stands at (9.09, −8.78, −66.57) — underground, y < −0.5 — so his
carried torch (a) displaces a sconce from the six-slot pool (V1's mismatch), and (b) **passes
the shader's y-gate and is consumed by the toon term at gain 2.5**, which the seal's
blast-radius arithmetic (six static sconces) never accounted for. F1's far-field warm shift
(+12 R−B) is the pool of an unregistered emitter, not a leak of the registered ones.
Art-direction note: a guard's torch casting real light in the tomb is *desirable* (it is
exactly the "torches cast nothing" complaint inverted); the fix is to REGISTER it, not gate
it out. Whether a guard belongs inside the tomb staging at all is a STAGING question, routed,
not this seal's.

## What run 4 does establish (evidence-grade, not verdict-grade)

The mechanism works end-to-end on its own instruments: the pool term produces +24.3 display L
of warm light under a sconce (92-point R−B swing, 89% warm coverage), dose-responds
monotonically (×1.64 at gain 6.0), pokes restore exactly (R1 0 px), null0 recompiles to the
branch-untaken build, and daylight arms hold gain 2.5 live in readback. Every same-boot bar
passed; every failure traces to the two diagnoses above.

## Disposition

1. `TUNE.localToon` reverted 2.5 → 0.0 in `src/render/Lighting.js` (the seal's registered
   fallback), committed citing this file. The uniform path and shader term stay.
2. **PREREG-torchlight2** (new file, same candidate bytes): slot table re-registered as six
   sconces + the guard's staged torch (position from run 4's diagnostic readback, disclosed
   calibrate-then-accept), F1 band re-derived by arithmetic over SEVEN emitters, D1 protected
   by a one-session discipline (fresh out-dir `torchlight2/`, no manifest resume across
   sessions — a resumed run re-runs its base boots).
3. Critic r11 holds until torchlight2 lands (the interior 4.5 complaint is exactly what this
   term addresses; an r11 without it would re-measure a known hole).

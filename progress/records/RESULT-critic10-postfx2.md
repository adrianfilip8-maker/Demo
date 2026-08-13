# RESULT-critic10-postfx2 — SHIP: the character-bloom gate passes every re-aimed bar; the write itself waits for the lock window

Scored against `PREREG-critic10-postfx2.md` (0027611). One boot, 17 jobs, no retries, no
clock steps; runner detached, candidate installed and restored under the lock (restore
verified: orig sha `c37d5c2d…` back in place). Frames + `verdict2.json` in
`shots/c10postfx2/`; scorer output logged at `progress/records/logs/c10postfx2an-run1.log`.

## Scoreboard (V1–V6)

```
V1 validity   back == base strict: 0 px on all five shots                          PASS
mask instr    traversal 7,052 · night 3,174 · interior 10,681 ·
              sly-closeup 66,687 · hero 17,390 px — none empty                     VALID
V2 premise    sly-closeup: 2,565 changed px, mean |ΔL| 5.10, darker 97.3%
              (bars: ≥300 / ≥3.0 / ≥90%; prediction 2,000–3,000 / 4–6 / ~97%)      PASS
V3 contain    changed px within mask+128: traversal 92/92 · night 0/0 ·
              interior 0/0 · sly-closeup 2,565/2,565 · hero 7/7                    PASS
V4 direction  brighter-side: 15 · 0 · 0 · 68 (≤129) · 3 — all under allowance      PASS
V5 halo-keep  subj1 |Δ mean L| = 0.000 on LAMPS/MOON/TORCH_A/TORCH_B;
              vacuity control: bloomoff drops −33.5/−33.3/−10.9/−14.8 (4/4 fire)   PASS
V6 looking    see below                                                            PASS
report-only   traversal SUBJ-DISPLAY Δ 0.000, BALL Δ 0.000
```

## The looking (V6, binding)

Base vs subj1 at 3× are near-identical: costume, face, gloves, and ink all hold; no halo
damage, no edge artefacts. The ×8 diff map is black everywhere except a handful of small
blobs pinned to the character's brightest costume highlights (hat band, glove knuckles, belt
pouch) — which is precisely the subject's own bloom re-feed being removed, a faint milkiness
on the hottest blues. Nothing else in the frame moved. That is the harm-free version of what
the parent run could not prove with bbox-aimed bars.

## Why the parent failed and this passed

The parent's three FAILs were aim errors, not gate errors (§298.1): it measured containment
against the PLAYER bbox while the gate acts on ALL skinned draws (the roof guard's 92 px on
traversal are now inside the mask reference and score 92/92), counted FXAA's both-ways edge
flips as "brightening" (V4's max(32, 5%) allowance absorbs 15/68/3 px of re-resolve noise),
and pinned SUBJ/BALL strip means that the subject's feed barely reaches (report-only Δ 0.000
confirms those ROIs never could have moved).

## Ship status — PENDING THE LOCK WINDOW

The seal's ship step requires the lock checked clear immediately before the write. At scoring
time the FIFO holds torchlight (running, boot A) and twilight (queued) — so the write is
**deferred to the post-queue window**, per §186 (no src/** writes while any capture holds the
lock) and §296 (one boot ≠ one tree). When the lock clears: apply
`progress/records/critic10postfx/PostFX.cand.js` to `src/render/PostFX.js` with the shipped
default flipped to `bloomSubjectCut: 1.0` and the comment citing this RESULT, suite green,
commit + push. This file records the verdict; the write commit cites this file.

Forecast ledger: the seal's predictions were right on every number that fired (3/16 overall —
this is the third registered forecast to survive contact with fresh frames).

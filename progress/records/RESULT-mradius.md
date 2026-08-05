# RESULT — mradius: the §24.3 moulding-radius arm (PREREG-mradius.md + ADDENDUM-mradius-arrisweight.md)

**STATUS: CAPTURE IN PROGRESS — no verdict yet. This file is the incremental record
(durable-early, ~45-min rollback cadence); the VERDICT block lands at the end when P1–P7
are scored.**

Executed 2026-08-05 by the GEOMETRY agent (same agent that sealed the prereg, per the
coordinator's §174 dispatch; seal committed at `1ddae5d`). Runner:
`progress/records/mradius-run.mjs` (banda2 template: per-chunk lock hold, idempotent
resume, incremental readbacks; tree-state arms with per-arm vite restart + per-arm
srcAtArm stamps). Scorer: `progress/records/mradius-score.mjs`.

## Pre-capture state, verified this session

- **The src tree moved between seal (`3be168ae28832f69`) and dispatch: now
  `7a4630875cac6e36`.** Explained: the coordinator shipped the hullkerb ACCEPT
  (`Props.js:135` `HULL_KEYS = new Set(['gold'])`) and possibly other owners' ships.
  `mradius-proj.mjs` re-run on this tree: **all 17 source anchors OK, rim2 causal 1,691
  EXACT, live hero-base 1,708 EXACT** — every constant this seal stands on is unmoved
  (the gold gate touches `props_gold` shells; the terrace cornices are court
  architecture). P1's base-arm gate arbitrates liveness on the capture boot regardless.
- **The patch was verified OFFLINE before any lock time** (scratchpad `verify-patch.mjs`,
  table in the ADDENDUM): `arrisBand: null` builds BIT-IDENTICAL buffers; `0.348` splits
  the annulus with exact (0,1,0) inner normals; `0` splits normals at the arris
  (75.1° / 0°). The ADDENDUM (committed BEFORE any frame) records the corrected
  arris-steepening model: corrected-model n_cand point ≈ 710–760 vs the sealed linear
  1,025 — the sealed gate [769, 1,281] stands unchanged; a sub-769 landing is the sealed
  P4 refuting the sealed linear model (revert-and-record), with the corrected model's
  prediction on record pre-frame.
- Lock state at start: held by SKY's skyswirl (pid 31114, alive-verified against /proc);
  queue empty. The runner tickets FIFO behind it (`tools/lock.mjs`; ticket
  `1785961522245-6863`), launched detached via `tools/launch.sh` (pid 6863, ppid 1
  verified from /proc).
- **Scaffold disposition (coordinator's question):** the `arrisBand` opt-in is NOT a
  staying scaffold. Pristine bytes (Kit sha `9ee3506f47a9…`, EgyptLevel `b2527f77f067…`)
  are restored and byte-verified before every ticket release; ship happens only via the
  seal's ship rule, by the coordinator, on ACCEPT.

## Capture plan (as sealed; chunked, decisive first)

| chunk | shot | arms (each its own tree state + vite + navigation) | frames |
|---|---|---|---|
| C1 | `hero` (decisive) | base → cand(0.372/0.348) → kb(0/0) → restore | 4 |
| C2 | `night` (retention) | same | 4 |
| C3 | `courtyard` (confinement) | same | 4 |

Per-arm liveness probe: cand/kb must move the counted tris column by 0 < Δ ≤ 400 vs base;
restore must be exactly 0 — a probe failure is FATAL (chunk void, no frames, revert).
Frames + `readback-C*.json` land incrementally in `progress/records/mradius1/`.

## Chunks landed

(updated as chunks complete — see `mradius1/readback-C*.json` for per-arm records)

- [ ] C1 hero
- [ ] C2 night
- [ ] C3 courtyard

## Scoring

(lands after frames; P1–P7 per the seal, counts via calibrated kerbband2, crops via
tools/crop.mjs)

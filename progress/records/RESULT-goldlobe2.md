# RESULT-goldlobe2 — registered scoring of the goldlobe2 capture (PREREG-goldlobe2.md)

Scored by SHADING, 2026-08-05, per `PREREG-goldlobe2.md` exactly as sealed (seal committed at
67367ac with the extended `banda-diag.mjs gold2` diagnosis). **Written incrementally
(§163/§164); an abrupt end means a rollback took the session, not that scoring stopped.**

**STATUS: IN PROGRESS — pre-edit + capture queued FIFO on the capture lock (behind
mradius-run → dual-ship-window → c2rerun at launch time).**

## Evidence and provenance (filled as steps land)

- **Pre-edit** (seal §2/§6): the `uGlintSharp` scaffold — TUNE.glintSharp 1.0 + uniform +
  the 4-line GLSL swap (glint's R from a re-steepened `Ns = normalize(mix(NgW, Nw, s))`,
  `NgW` from three r185's unconditional `nonPerturbedNormal`) — applied ONLY inside a held
  ticket by `apply-goldlobe2.py` (dry-run verified on copies first: anchors matched exactly
  once each, no backticks inserted, node --check + module import + exported-strings check all
  green). **Inert-by-gain at the shipped `TUNE.goldGlint 0.0` — the add is ×0.0 exact.**
  Like its predecessor, the scaffold STAYS in the tree after the capture (the seal registers
  it as a staying scaffold); **commit is the coordinator's.** The applier verifies it
  actually holds `capture.lock` before touching src (acquire's timeout path returns unheld —
  guarded), and restores both files from byte copies on any verify failure.
- **Runner:** `progress/records/goldlobe2.mjs` (committed; goldlobe1 template + settle
  protocol + three-uniform readback; idempotent resume). Chain launcher (scratchpad,
  `goldlobe2-chain.mjs`): pre-edit ticket → release → the runner's own withGame ticket.
  Launched detached via `tools/launch.sh`, pid 20155 verified ppid 1; log
  `progress/records/logs/goldlobe2.log`; pidfile in scratchpad.
- Arms per the seal §6: base (0/20/1) / As (2.6/20/1.25) / cand (2.6/20/1.5) /
  KBwidelobe (5.2/2/1) / null (0/20/1 = P-F2+P-F4) — traversal then combat, one boot.
- Frames + readback land incrementally at `progress/records/goldlobe2/`.

## The port proofs this scoring will be read against (sealed before capture)

- Sharp forward table (gold2): s=1.5 lifts measured mover percentiles to display 218–222
  (lobe window ≈ 212; B-p99 band [222,252]); flat body (δ 2.3°) pinned at 126 at every s.
- **KB-widelobe port proof: 33.2 % of visible-face body rays ≥ L160 vs the 20 % B2′
  explosion line** — the predecessor's binding obligation, discharged in-port. A KB low-read
  in-frame is **P-F6′: VOID + re-diagnose** (the port made a definite claim), not
  UNSCOREABLE.

## Chunk log

(filled as the pre-edit and chunk G2 land)

## Scores

(the seal's §3 table lands here verbatim: gates G-0a/G-0base/G-0c + occluder derivation,
then B1′/B2′/B3′/B4/B5/B-p99/cane guard on cand, dose ordering base < As < cand, KB and
null verdicts. Scoring pipeline per the seal: fresh `matmask.mjs` masks at the captured
tree, `gildlit.mjs`, `goldgap.py` with `goldgap-jobs-goldlobe2.json` — all offline, no lock.)

**Resume instructions if a rollback takes this session:** relaunch
`bash tools/launch.sh <scratchpad>/banda2/goldlobe2-chain.mjs
/home/user/Demo/progress/records/logs/goldlobe2-r2.log <scratchpad>/banda2/goldlobe2.pid`
after sweeping `/tmp/sands-of-ra/queue` against /proc (§140.2) — the chain skips the
pre-edit if `uGlintSharp` is already in the tree and the runner skips arms whose frames
exist. If the scratchpad died, the pre-edit patch content is PREREG-goldlobe2 §2 verbatim
and the runner is committed.

## Verdict

Pending. Per the seal: PASS requires B1′/B2′/B3′/B5/B-p99 in-band on cand with **B4 ≤ 0.65
(revert-regardless)**, dose ordering monotone, KB-widelobe reading as its own failure
(B2′ > 20 %), null bit-identical to base, gates clean. Ship decision is the coordinator's.

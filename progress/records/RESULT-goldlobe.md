# RESULT-goldlobe — registered scoring of the goldlobe1 capture (PREREG-goldlobe.md, sealed 87e5efd)

Scored by SHADING, 2026-08-05, per `PREREG-goldlobe.md` exactly as sealed. **Written
incrementally (§163/§164); an abrupt end means a rollback took the session.**

**STATUS: PENDING — runs after banda1's chunks complete (banda first per the coordinator's
sequencing; the scaffold edit lands only inside this phase's held ticket).**

## Sequencing note, recorded before the fact

The seal's §7 preference — scaffold committed BEFORE the shared window so every chunk stamps
one tree — was not available: the coordinator's execute order ran banda's chunks first on the
pre-scaffold tree (banda chunk A srcTree `820ace395b9664ae`), and the scaffold lands after
them. The seal's own fallback governs ("chunk E is self-contained"): banda's arms do not
reference the scaffold, chunk E boots the scaffolded tree and stamps its own hash, and
**G-0base arbitrates** that the defect is unchanged on the scaffolded tree (base tail ∈
[1.2, 3.0] %, lobe ≤ 20 px). The banda↔goldlobe cross-chunk tree difference is exactly the
inert scaffold, whose in-boot null arm (P-F2, 0 px vs base) is the inertness proof.

## Evidence and provenance (filled as the phase runs)

- Scaffold: `src/render/ToonMaterial.js` (TUNE.goldGlint 0.0 / glintPow 20 + shared uniforms
  uGoldGlint/uGlintPow) and `src/render/shaders/toon.glsl.js` (TOON_PARS decls + the glint
  leg inside the `uMetal > 0.001` branch) — exact §2 GLSL; applied by
  scratchpad/apply-goldlobe-scaffold.py (dry-run verified on a copy: module imports, no
  backticks, anchors unique). Ships inert by design; commit is the coordinator's.
- Runner: `progress/records/goldlobe1.mjs` (committed) — chunk E, one boot, traversal +
  combat, arms base / Alo(1.6/20) / cand(2.6/20) / KBchrome(2.6/5) / null(0/20), per-arm
  readback, frames to `progress/records/goldlobe1/`.
- Scoring: fresh `matmask.mjs` masks at the scaffolded tree, `gildlit.mjs` gates (G-0a,
  G-0base, B2'/B3'), occluder map re-derived per goldtraversal §6 (FX-glow exclusion +
  positive control), `goldgap.py` with a goldlobe jobs file (B1'/B4/B5/p99).

## Gates

Pending.

## Scores

Pending.

## Verdict

Pending. Ship decisions are the coordinator's; on any FAIL the registered move is
`TUNE.goldGlint` back to 0.0 (one constant — the scaffold itself stays, inert).

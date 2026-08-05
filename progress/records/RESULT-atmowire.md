# RESULT-atmowire — atmowire1 vs PREREG-atmowire.md

**STATUS: IN PROGRESS. Run 1 (2026-08-05 22:17–22:20) = CAPTURE VOID, zero frames, with the
mechanism named below (§VOID-1) — a runner premise-gate encoding bug, not a tree defect and
not a seal defect. The C1 seam applied cleanly, is bit-inert at `uAtmoWire 0`, and stays
in-tree per the seal's §6 (committed by coordinator sweep, 8591a20). The corrected re-run is
queued; its scores will extend this file.**

Executor: SKY (per §174 dispatch). Seal: `PREREG-atmowire.md` (SHADING's; authoritative).
Ownership flags per the seal: C1 shader seam = SHADING's files, C2 publisher line = SKY's
file, C3 fog-target dose = FX's file — every ship decision is the coordinator's.

## VOID-1 — run 1 adjudication (registered outcome: VOID with mechanism, not defended)

**What happened:** both chunks fataled at the runner's own W1 premise gate before any
capture: `_fogSynced at boot is undefined, expected false (side-door active)`. Chunk A
fataled, the loop proceeded to chunk B, which fataled identically; the runner released the
lock cleanly. Zero arms captured; `readback-{A,B}.json` hold the lever probes.

**The mechanism, diagnosed from committed source + the run's own readbacks:**

1. `ToonMaterial.js` has exactly THREE `_fogSynced` sites: the writer
   (`this._fogSynced = true` inside `setAtmosphere()`, :1403) and two falsy-readers
   (`if (!this._fogSynced)`, :1663 and :1766). **There is no constructor initializer — the
   field is `undefined` at every boot by design**, and the side-door runs precisely because
   `!undefined` is true. "Side-door active" is encoded in the tree as *falsy-until-first-
   `setAtmosphere`*, not as a literal `false`.
2. The runner's gate demanded the literal: `lever.fogSynced !== false → FATAL`. That check
   fails on every healthy boot of this tree — including a boot of the pre-seam shipped tree.
   The premise the gate meant to test was TRUE at both boots: the same lever readback shows
   `uHazeDensity 0.012215773 = max(fog.density 0.00469837 × 2.6, 0.004)` — the side-door's
   own arithmetic (ToonMaterial.js:1657 family), live on the page at probe time.
3. The coordinator's other two hypotheses are excluded by the same readbacks: not the seam
   (`hasWire true, wire 0`, all three published-param uniforms present, and the side-door
   arithmetic live — the seam at defaults changed nothing, as designed); not an interaction
   with the shipped skyswirl `uGraze` (Sky.js-only change; the probe's atmosphere values
   are ordinary for the boot tod, and nothing in the fatal path touches Sky).

**Verdict on run 1:** VOID by the runner's own gate, and the gate was wrong — the seal's W1
premise (side-door live, single `_fogSynced` writer ⇒ pokes durable) was satisfied. No
P-falsifier of the seal fired; no seal amendment is needed (the seal never demanded a
boot-time literal `false`; the runner invented it). §141 discipline: the instrument's
failure is reported as the instrument's failure.

**The corrected re-run needs exactly one change (runner-local, applied at
`atmowire1.mjs`):** the premise gate now (a) fatals only on a TRUTHY `_fogSynced` (a
publisher already ran = genuine premise break), and (b) asserts the side-door mechanism
positively — `uHazeDensity == max(fog.density × 2.6, 0.004)` within 1e-9 at boot (§143.1:
gate the mechanism, not a flag literal). Nothing else changed: same arms, same pokes, same
WBANDS scorer, same seam (already in-tree; the runner's idempotent apply verifies it
verbatim and skips).

**Note for P-F4 readers of the coming re-run:** the restore arm sets `_fogSynced = false`
explicitly while base leaves it `undefined`. Both are falsy; the side-door takes the same
branch with the same inputs, so restore-vs-base pixel identity is unaffected — the
readbacks will show `undefined` (serialized as absent) at base and `false` at restore, and
that difference is bookkeeping, not state.

## Provenance of run 1 (for the record)

- Seam applied inside the FIFO hold at 22:17:29: pre-seam tree `dfa198283676610f` → seamed
  `a8925573a9ec3ff6` (the tree had moved past the seal's diagnosis tree `3be168ae28832f69`
  via the skyswirl ship ace14f3 and other owners' commits — expected; the seal's base gates
  exist to arbitrate exactly this). Pristine copies: `atmowire1/*.pre-seam`.
- Seam anchors applied exactly-once, verified pre-launch on the live tree; the seam is the
  seal §2 C1 design verbatim (uniform decls in SLY_COMMON reach surface AND ink programs;
  `applyAerial`'s blend and haze-colour forms ported exactly; `setAtmosphere` accepts
  `heightFalloff`/`inscatter`/`tint`, inert while `uAtmoWire` is 0).
- Both boots: SwiftShader/ANGLE Vulkan; lever probes identical across chunks (as expected —
  same tree, same defaults).

*(Scores, Q-SEAM crops, Q-REG rows, P-falsifier checklist, and the verdict land here from
the corrected re-run's `WSCORE` output.)*

## Files (so far)

- `progress/records/atmowire1.mjs` — runner (corrected gate; header documents the fix)
- `progress/records/atmowire1/` — `readback-A/B.json` (run-1 lever probes + fatals),
  `run.log`, `seam-state.json`, `toon.glsl.js.pre-seam`, `ToonMaterial.js.pre-seam`
- `progress/records/fxcluster-diag.mjs` — WSCORE amendment (WBANDS verbatim; seam strips
  validated against the sbs2 dunes skyline: soft segment x 1030-1150, base step 2.2 L)
- `progress/records/RESULT-atmowire.md` — this file
- `src/render/shaders/toon.glsl.js`, `src/render/ToonMaterial.js` — carry the C1 seam
  (STAYS per seal §6, fxcluster §1 pattern; inert at `uAtmoWire 0`)

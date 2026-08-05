# RESULT-skynoise — scoring of the skynoise1 capture against PREREG-skynoise.md

**STATUS: CAPTURE IN FLIGHT — DO NOT CITE. This banner is replaced by the scored verdict
when `skynoise-diag.mjs score` has run on the landed frames. If this banner is still here
after 2026-08-05, the run was interrupted; check `progress/records/skynoise1/*/readback.json`
for which chunks landed and resume with `node progress/records/skynoise1.mjs all` (idempotent).**

Owner: SKY. Capture per PREREG-skynoise.md §8, coordinator-authorized 2026-08-05 (lock free
after hullkerb). Runner: `progress/records/skynoise1.mjs`, launched detached via
`tools/launch.sh` (ppid 1 verified), arms as live pokes with `step(1, dt=0)` between arms.

## Method restated (sealed values, for the reader who has only this file)

- Arms per §8: base (shipped, known-bad #1) / cand (uDeckScale 0.000105, 0.000138, 0.000105 +
  uDeckSoft 0.36, 0.38, 0.40 — the six registered numbers) / flat (uCloudCover 9,9,9,
  known-bad #2, poster sky = REJECT reading) / restore (P-F4 bit-identity control).
- Chunks: A courtyard, B night, C dunes (4 arms each), D hero (base/cand/restore).
- Scoring: `node progress/records/skynoise-diag.mjs score progress/records/skynoise1` —
  hf (= hf_x + hf_y, Rec.709 luma 0–255, registered rects/masks), PD9, paired excess
  (arm − flat, same boot). Bands are PREREG §4's; the prereg is authoritative.

## Provenance

(to be filled from skynoise1/*/readback.json: src-tree hash before/after per chunk, lever
probe, per-arm poke readbacks, setShot stats)

## Score table

(to be filled verbatim from the score mode output)

## P-falsifier checklist

- P-F1 (excess bands): pending
- P-F2 (PD9 structure floor): pending
- P-F3 (base gates): pending
- P-F4 (restore bit-identity): pending
- P-F5 (non-sky proxy zone coupling): pending
- P-F6 (seam scan, human): pending
- P7 (eyeball at stated zoom, registered vocabulary): pending

## Verdict

Pending. Ship decision is the coordinator's; this file reports the seal's own verdict only.

## Files

- `progress/records/skynoise1.mjs` — runner
- `progress/records/skynoise1/{A,B,C,D}/<shot>.<arm>.png` + `readback.json` — frames + stamps
- `progress/records/RESULT-skynoise.md` — this file

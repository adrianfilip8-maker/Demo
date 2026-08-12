# ADDENDUM-attractor3 — CAL-FULL was derived from the wrong pair, and the run VOIDs by its own letter before the mid shots are seen

Written while `tools/attractor3.mjs` is still capturing: the `sly-closeup` calibration boot has
landed and been read; the `hero` and `interior` boots have not landed and have not been seen.

## The defect

PREREG-attractor3 §3 set **CAL-FULL: R_composed(sly-closeup) ≥ 0.85**, described as "the run
reproduces the known close-up behaviour". The known close-up behaviour of the CURRENT texture
pair is `RESULT-bodyhue6.md`: swing **−9.0°**, R **0.80** — the number the bar itself cites
sits below the bar. The 0.85 came from the −21.1° pair's R ≈ 1.01–1.04 (run 4). This is
§282's error class again — a constant carried across texture pairs — this time in a
calibration bar rather than a mask floor.

Measured this run: composed −9.1° (R 0.81, reproducing bodyhue6 to 0.1°), rawscene −10.8°
(R 0.96, cov 1.85 % — CAL-CHAN fires comfortably). The instrument is fine. The bar is wrong.

## Handling

By the seal's letter the run is VOID, and that is how it is scored. `PREREG-attractor3b.md`
re-seals with every §4 bar **verbatim** and only CAL-FULL re-derived from the correct source:
composed close-up swing within ±2.0° of bodyhue6's −9.0°. Disclosures, so the re-seal's
epistemic position is on the record:

- The close-up boot's numbers (above) were seen before the re-seal. They enter S only as the
  denominator (R_rawscene(closeup) = 0.96), which is now known.
- The `hero`/`interior` numerators were NOT seen at re-seal time; the POSTFX-SIDE /
  SCENE-SIDE bars on them are unchanged, so knowing the denominator moves no bar toward any
  outcome.
- The in-flight capture continues; its mid-shot rows will be scored under attractor3b as
  fresh, unseen data. Nothing is recaptured — the close-up pair is a calibration, not a
  candidate, and its reuse is disclosed rather than laundered through a re-run.

One incidental finding worth carrying: even at close range the display transform eats ~1.7°
of a −11.3° authored swing (0.96 → 0.81). Whatever the mid-shot verdict, PostFX is not
hue-neutral on the costume.

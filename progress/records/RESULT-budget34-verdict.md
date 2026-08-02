# §1 budget — FORMAL VERDICT (ledger #34): CLOSES AS BOOKKEEPING, one leg pending bud35

Scored input: progress/records/budget34-table.txt (f026ef3; boot on c61941c, src-identical
to 7b0e3f8). Ruling applied: §1 is scored on MAIN-VIEW VISIBLE triangles/draws; the
renderer.info line is pass-multiplied frame cost, reference only.

## Measured directly (the scored line, vs 250 draws / 1.200M tris)

| shot | main-view | % of budget | renderer.info (ref) | multiplier (tris, draws) |
|---|---|---|---|---|
| night | 93 / 0.668M | 37% / 56% | 277 / 1.795M | 2.69, 2.98 |
| guard | 52 / 0.417M | 21% / 35% | 179 / 1.308M | 3.14, 3.44 |
| courtyard | 92 / 0.648M | 37% / 54% | 251 / 1.591M | 2.46, 2.73 |
| hero | 86 / 0.616M | 34% / 51% | 238 / 1.638M | 2.66, 2.77 |

Worst measured main-view: **night, 93 draws / 0.668M — 44% triangle headroom, 63% draw
headroom.** All four inside.

## The inference step, stated so it can be attacked

budget34 measured four shots, not ten. The provenance header says the four were "the worst
of bud34's eight-row counted column" — **that is not exactly true and I am not defending
it**: guard has NO bud34 row (bud34 died before it), and dunes (258 counted draws, the
2nd-worst draw count in bud34) was NOT measured. The counted column also cannot strictly
order main-view: counted = mainView × multiplier and the multiplier is shot-dependent
(measured spread 2.46–3.14). So the four-shot selection does not by itself bound the six.

What DOES bound them, in three steps:

1. **Absolute containment.** The main view is one of the passes renderer.info sums, so
   mainView ≤ counted, per shot, unconditionally. This alone closes **interior**: bud34
   counted 149 / 0.656M, both under budget with no further assumption — even at
   multiplier 1.0 it cannot breach.
2. **Tree-seam margin, measured not assumed.** bud34's counted rows are tree@08:15;
   budget34 booted c61941c. On the three shots present in both, counted moved −4.4%…+1.8%
   draws, −2.6%…+1.1% tris. Applied margin: ×1.05 on bud34 rows (2.8× the worst observed
   upward drift).
3. **Multiplier floor 2.0.** Min measured multiplier is 2.455 (courtyard, tris); the floor
   used is 2.0, 18.5% below it. Structural justification: at quality high every frame runs
   three cascade shadow passes plus AO, outline and composite over the main view; the four
   remaining unmeasured shots (temple, sly-closeup, dunes, traversal) are daylight/hall
   framings with full caster sets — the population the measured multipliers came from.
   This is the one assumption in the chain; any challenge converts to a measurement by
   pointing budget.mjs at the shot.

Bounds for the unmeasured (bud34 counted × 1.05 / 2.0):

| shot | counted (bud34) | bounded main-view ≤ | vs budget |
|---|---|---|---|
| temple | 221 / 1.622M | 116 / 0.852M | inside |
| sly-closeup | 244 / 1.583M | 128 / 0.831M | inside |
| dunes | 258 / 1.516M | 135 / 0.796M | inside |
| traversal | 241 / 1.683M | 127 / 0.884M | inside |
| interior | 149 / 0.656M | 156 / 0.689M (absolute ×1.05, no ratio needed) | inside |

## The pending leg: combat

combat has NO fresh counted row anywhere — bud34 died before it, budget34 didn't include
it, and shots/fx13 (which carried a counted combat row on the 00:40 tree) was destroyed in
the 11:33 restart. **The verdict's combat leg closes on bud35's report row** (bud35 is
rendering it 9th of 10, same-src tree as the reference — no seam margin needed).
Pre-stated closure bands, which partition (§26.1):
  - bud35 combat counted ≤ 2.400M tris AND ≤ 500 draws → combat bounded inside at floor
    2.0; verdict complete, CLOSED.
  - counted > 2.400M tris OR > 500 draws → bound insufficient; route combat to a direct
    budget.mjs measurement before closing. (Not a failure verdict — a measurement order.)
Every emittable value lands in exactly one band.

## Verdict

**§1 closes as bookkeeping** on nine of ten shots now — four measured (worst 56% of tri
budget), five bounded (worst bound 74% of tri budget) — with combat's leg completing
mechanically on bud35's row per the bands above. The 2.5–3.1× pass multiplication is
real frame cost and stays open as a FRAME-TIME item, explicitly unsettleable on this
GPU-less container (SwiftShader ms is meaningless per the method rules); nothing further
to optimise for §1 compliance itself.

Counter-window rule carried forward: any future cache-on stats quote uses the corrected
column (counted + amortised static-refresh), never the counted one — Engine resets info
after module updates, so Lighting.update()'s cache work is invisible to engine.stats.

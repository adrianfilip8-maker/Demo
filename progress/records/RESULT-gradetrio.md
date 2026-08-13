# RESULT-gradetrio — two ships, one honest fail: the raking key and the night floor land; the tomb ambient dim takes the pools down with it

Shared one-boot run (83 frames + manifest, src clean at release, all validity/backs green,
trees exact). Scorer logs `{tombdim,goldenrake,nightfloor}-score.log`.

## goldenrake — SHIP (rakeTrack 1.0)

All bars green: con arms, 8 protection shots, VC/V4. LOOK (binding, off vs con): hero's
raked courtyard floor and deck warm toward gold while cast shadows hold their cool tone and
Sly is unchanged; sly-closeup holds the character as the cool focal accent against the
brighter floor (and the cane hook picks up a warm edge light); no noise read. The §2.2
anchor's arithmetic hole (sin 22° = 0.3746 < termHi+soft 0.544) is closed by the tracked
terminator. SHIPPED: TUNE.rakeTrack 0.0→1.0, pin tests updated to the shipped frame.

## nightfloor — SHIP (shadowFloorNight 0.14)

N1–N3/G1/KO/VD/V4 green. LOOK (off vs don): the crushed night masses lift to a legible
violet-teal — panel detail emerges in the lower-left structure and plinth sides — while
moon, lanterns, and the night mood hold; not "less night". SHIPPED: TUNE.shadowFloorNight
0.125→0.14 (§2.2's own SHADOW_FLOOR), pin/mechanism tests re-anchored to the shipped
reference frame (inert legs became explicit 0.125 pokes; the strict-> gate assertion now
requires night > day floor so a silent no-op regression fails loudly).

## tombdim — DO NOT SHIP (D2/D4 FAIL; fallback tombAmb 1.0 stays)

The ambient-family dim (0.30 arm) achieved the intended darkness (FAR 63.9→39.7 L, VAULT
74.1→42.2) and even improved pool contrast as a RATIO (1.49→1.91) — but it dragged the
absolute pools and sarcophagus down with it (POOL 95.0→75.7, SARC 72.2→50.7), violating the
seal's absolute holds. Mechanism finding: the torch pools ride the ambient term more than
the model predicted, so a pure ambient dim cannot brighten-by-contrast alone. Follow-up
routed: re-derive with the pool term's gain co-raised (localToon is live at 2.5 — a paired
dim+raise seal), or accept ratio-based bars in a re-seal with the mis-aim recorded.

LOOK-economy disclosure: the frames named by the two shipping seals' §8 lists that carry
strict-0px protection bars are pixel-identical by measurement and were not re-eyeballed;
the change-bearing pairs (hero, night, closeup) were. Forecast ledger 6/19 (goldenrake and
nightfloor forecast SHIP — right twice; tombdim forecast SHIP — wrong).

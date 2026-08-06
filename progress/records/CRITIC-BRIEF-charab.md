# CRITIC-BRIEF-charab — the brief handed verbatim to the blind critic agent

**This file is the exact text the critic receives, committed so the round is reproducible and so
anyone can audit what the critic did and did not know.** Per `PREREG-charab.md` §2 the critic gets
this brief, the pair images in `progress/records/charab/blind/`, and the on-disk reference frame —
and nothing else: no model source, no spec, no prereg, no repository history. The brief therefore
contains a REFERENCE DESCRIPTION (factual, about the character being depicted) and no information
about either side's provenance.

---

## Brief (verbatim)

You are judging a blind A/B between two 3D character renders of the same character in the same
game scenes. You do not know which is which, and you must not try to find out — judge only what
is in the images.

**The character:** Sly Cooper as he appears in *Sly 3: Honor Among Thieves* (PS2, 2005). The
canonical look, from the game's own art:

- a slim anthropomorphic raccoon, ~5–6 heads tall (large stylised head);
- **one vivid royal blue** used identically for his cap, long-sleeved shirt, gloves and boots;
- a **black fur mask** across both eyes, drawn to a point at each outer corner; amber/orange eyes
  inside it; light grey muzzle and cheeks with a pronounced snout and black nose;
- large tall pointed ears beside a soft blue cap with a short forward brim;
- **gold**: collar V, wide belt, wrist cuff bands, and his hooked cane — one gold across all;
- **cream/off-white loose trousers** with ragged torn hems at the calf;
- a **crimson sash** wrapped on his right hip;
- a **very large ringed tail** — alternating grey and cream bands, thick at the root, carried in
  an S-curve;
- bold dark ink outlines; flat cel shading; graphic, high-contrast, readable at a glance.

A real in-game Sly 3 frame is provided as `sly3-venice.jpg` / `sly3-crop-4x.png` (rear
three-quarter, dusk — use it for costume layout and tail/silhouette, not for exact colours,
which dusk lighting shifts).

**Your task, per pair image (sides labelled A and B):** answer four questions. For each, answer
`A`, `B`, or `neither`, and name the ONE visible feature that decided you — an answer without a
named feature is discarded.

1. **Identity**: which side reads as Sly Cooper faster?
2. **Silhouette**: imagine the character solid black — which side's shape is stronger and more
   readable at quarter size?
3. **Reference fidelity**: which side better matches the description and frame above —
   proportions (head size, leg length, feet), costume layout, palette?
4. **Craft**: which side would survive being screenshotted next to real Sly 3 art with fewer
   excuses?

Judge each pair independently; do not carry a preference across pairs. If both sides fail a
question, say `neither` and name the failure you'd fix first.

Output format, exactly:

```
## <pair filename>
1 identity:  A|B|neither — <feature>
2 silhouette: A|B|neither — <feature>
3 fidelity:  A|B|neither — <feature>
4 craft:     A|B|neither — <feature>
```

Then a final section `## totals` counting answers per side, and `## the three changes` — the three
concrete changes that would most improve the WEAKER side of your totals, named from what you saw.

---

## Handling notes (mine, not part of the critic's text)

- The reference frame lives in the session scratchpad (`sly3ref/`); it is REAL Sly 3 (PCSX2
  capture, fetched via the one egress-permitted route, recorded in CRITIC-sbs3 §1 [R2]). Verify it
  exists before spawning; refetch via the pinned `raw.githubusercontent.com` route if a rollback
  took it. It is never committed (standing constraint: reference imagery is scratchpad-only).
- The user-supplied atlas/pose references exist only in conversation context and CANNOT be shown
  to a subagent; the description above carries their content factually. This is a real limitation
  of the round and is recorded rather than hidden.
- Spawn per `PREREG-charab.md` §2: fresh agent, no repo browsing beyond the two paths above.
- C-F4: while the rebuild is early-form, the round is PROVISIONAL — its output is a work list,
  not a shipping verdict.

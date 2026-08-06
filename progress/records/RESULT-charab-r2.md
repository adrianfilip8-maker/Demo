# RESULT-charab-r2 — blind round 2: incumbent vs SlyModel3 **stage 4**

**PROVISIONAL per PREREG-charab C-F4** (the rebuild is still mid-iteration). Protocol held: fresh
agent, seed-2 pairs (sides re-randomised per shot — `traversal` flipped this round), key committed
before the spawn, verdicts per side letter with a named feature each.

## Verdict, translated through the key

| pair | A | B | letters | by model |
|---|---|---|---|---|
| sly-closeup | base | model3 | A,A,B,A | incumbent 3 — rebuild 1 |
| sly-profile | base | model3 | B,B,B,B | **rebuild 4 — incumbent 0** |
| sly-perch | base | model3 | A,A,B,B | incumbent 2 — rebuild 2 |
| traversal | model3 | base | B,B,B,B | **incumbent 4 — rebuild 0** |

**Incumbent 9, rebuild 7.** Round 1 was 16–0. Two stages of iteration moved the round from
shutout to near-parity.

**Blinding held, again, and better than held.** The critic independently detected that the label
does not track the render ("in traversal that is reversed"), verified it by *saturation sampling*
(12,890 high-chroma royal-blue pixels vs 2,587 on the closeup crop), and reported the by-render
total — **9–7, matching the key translation exactly**. It also measured head ratios rather than
eyeballing them (incumbent ≈ 4.4 heads in closeup, 3.5 in profile — too squat; rebuild ≈ 6.1 —
top of the 5–6 window; "neither is centred on the target").

## Where each model now wins

- **Profile flipped completely: 0–4 → 4–0 for the rebuild.** Round 1's harshest critique lived in
  this shot; stages 3–4 (banded tail, level fused muzzle, mask point behind the eye, brimmed cap,
  hooked cane) took all four questions. The critic's profile line for the *incumbent* is now the
  one that reads like round 1's line for the rebuild: "cap and skull fuse into one featureless
  ovoid ... no eye, no mask, no ear point, no snout."
- **Fidelity is the rebuild's sweep** (3 of 4 pairs, and 2–2 in perch on top of it): "gold belt
  over cream trousers with the crimson sash, under one vivid royal blue" — versus the incumbent's
  "hip-to-boot run is one unbroken slate blue". The critic even ruled out the lighting excuse:
  "the other side proves the dusk lighting is not the cause: it holds full chroma in the
  identical scene."
- **Traversal is the rebuild's collapse (0–4)** and is precisely actionable: at gameplay distance
  the tail "reads as a rope or a spare limb" (uniform-diameter, kinked), and **the cane detaches**
  — floating clear of the hand in profile, clipping the tail, "stabbing through the hip" in perch,
  and in traversal "A hangs from nothing".

## The critic's fix lists

**For the incumbent** (its three changes target the weaker *label*, which was the incumbent in
three pairs): build the missing lower-body costume (cream trousers, gold belt, sash); collapse the
three-or-four desaturated blues to one royal blue with flat cel steps; fix the head at 90° (brim
that breaks the outline, mask carried onto the side of the face, ears standing off the skull,
amber eyes, no cream blaze splitting the mask). **Recorded, not applied** — the task is the new
model; strengthening the incumbent is out of scope for this window and would move both goalposts.

**For the rebuild** (its closing paragraph): the traversal tail and the cane attachment. That —
plus its closeup face notes ("flat-ended grey cylinder with no nose", "mask a lopsided blob
covering one eye" from three-quarter) — is stage 5:

1. tail: more samples (kink), stronger tip taper (rope), root kept;
2. cane: shorter lower shaft, path through the fist, no hip/tail intersection;
3. face at front-three-quarter: mask bridge wide enough to cover both eyes, nose capping the
   muzzle tip;
4. head presence: nudge toward the centre of the 5–6 window (rendered 6.1).

## Standing consequence

Unchanged: the incumbent remains the default everywhere (no token ⇒ `SlyModel.js`). The trend
across rounds (16–0 → 9–7) is the number to beat in the final round; ties still restore the
incumbent.

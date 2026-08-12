# RESULT-critic10 — REJECT (avg ≈ 4.9, best 7.5), and D2 is silent for the first time in ten rounds

Blind round on `shots/r10/` (16 frames + crops + manifest, commit 58e3f49, single boot). The
critic received the standing brief (`tools/CRITIC.md`) and the frame directory — no changelog,
no knowledge of the day's ships. Verbatim verdicts below; the full report is preserved in the
session log.

## Scores

```
temple 7.5 · night 7 · hero 6 · kaykit 6 · traversal 6 · dunes 5.5 · courtyard 5 ·
sly-key 5 · sly-closeup 5 · interior 4.5 · sly-profile 4.5 · combat 4 · sly-startle 4 ·
sly-perch 3.5 · sly-arm 3.5 · guard 2
OVERALL: REJECT — zero shots at the 8/10 floor. Hard-constraint violations independently
block ship: 15/16 shots over the §1 1.2M triangle budget (1.7–2.6M), 6 over 250 draw calls,
and a runtime fetch 404 (Audio.js:394 / Textures.js:227 family).
```

The critic also self-verified §7.3's head-ratio annotation as stale (measured 5.03 heads,
inside 4.5–5.5 — no proportion failures) — the fail-list needs that line updated.

## The D2 read (my expectation, registered in the check-in prompt, never shared with the critic)

**Costume hue is not a ranked defect in any of the 16 shots.** Ten rounds of "the costume
reads violet" end here: close range fixed at the texture (bodyhue6), mid range at the
mechanism (subjhold2), and the blind referee no longer sees it. Every remaining mention of
Sly's blue is the RED KEY FLOOD washing it out (perch/arm/combat) — explicitly a LIGHTING
defect in the critic's own routing. §277's saturation half and D3 likewise did not surface
as ranked items this round (the face/fur complaints are sculpt, not shading).

## The three worst, as ranked, with routing

1. **Sly's head sculpt + default idles poison 7/16 shots** — no muzzle projection (flat in
   profile), human smile creases, low-lateral ears; knock-kneed splay-hand idles and a
   collapsed sit. Owners: CHARACTER + ANIMATION. **Routing caution:** the default model is
   the owner-supplied `dlrig` by explicit owner instruction (2026-08-07). A resculpt touches
   their asset — needs either owner sign-off or a strictly additive rig-level treatment; not
   a unilateral call.
2. **Unclamped lighting/post family degrades ~9 shots** — saturated red-flood key
   (perch/arm/combat/courtyard), torches that bloom but don't light (interior), bloom
   blowing the subject to white (traversal) and the combat trail donut, lens-ghost floaters
   (temple/profile/kaykit/night), foreground crush below the §2.2 floor (night/hero).
   Owners: LIGHTING + POSTFX.
3. **The guard does not render** — untextured black-gloss body, cube head, glowing arms,
   sourceless cone, no flashlight. Owner: GUARDS (`GuardModel.js`) — a material/texture
   binding failure, the highest-certainty fix on the list.

**Also routed:** recurring floating rings/discs in 7+ shots (likely D12's `cane_ring` family
— fresh evidence for the attribution that lost its frames; `ringPainter` remains
do-not-touch per RESULT-fxshape §5.1) and rope-coil/pot prop monoculture → PROPS · dunes
sand-as-rust-crackle → TERRAIN+TEXTURES · colossi block-stacks → PROPS/Statues · budget
breach → set-wide, lead arbitration · runtime-fetch 404 → AUDIO+TEXTURES (self-containment
mandate) · live-clock `setShot` warning → LOCKED tools/core, lead · sparkles shipping white
instead of `#8fd8ff`/`#2a7fd4` → FX.

## Standing

The critic's one-sentence encouragement stands as the direction check: *"temple's
composition, night's staging, kaykit's sun patches, and dunes' hazed pylons show the art
direction is reachable — the set fails on character, grading discipline, and unfinished
renders, not on vision."* Next work, in routed order: the guard render bug (certain, owned,
bounded), then the lighting/post clamp family under seals, with the head-sculpt question
surfaced to the owner.

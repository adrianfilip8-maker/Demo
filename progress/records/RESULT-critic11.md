# RESULT-critic11 — blind round 11: REJECT, avg 4.44/16 shots (r10: 4.9); three failure families own almost everything

Blind critic (tools/CRITIC.md verbatim, shots/r11/ = 16 frames + 16 crops + manifest, no
changelog, no ship info). Verdict and scores quoted verbatim; routing applies §294's owner
waiver AT ROUTING ONLY (the critic saw nothing of it).

## Scores (verbatim)

```
temple 7 · night 6 · traversal 6 · kaykit 5 · sly-closeup 5 · courtyard 5 · sly-key 5
hero 4 · sly-startle 4 · sly-arm 4 · dunes 4 · interior 4 · sly-profile 4
sly-perch 3 · combat 3 · guard 2                    avg 4.44 — "Temple at 7 is the
ceiling; nothing reaches the 8 floor. REJECT."
```

## The critic's three worst problems (verbatim, condensed) and routing

1. **"The exposure/grade catastrophe"** — the red-salmon flood erasing albedo (perch/arm/
   combat/courtyard), lit toon bands blowing Sly's blue to white (traversal, combat), guard's
   frame-eating white wash, crushed night blacks, hero's missing 22° raking sun.
   → **LIGHTING** (+POSTFX complicity). Notes: perch/arm tod-0.80 staging = the standing
   **Option-A owner question** (§300 proved no twilight device reaches these frames); the
   lit-band desaturation is §277's saturation half, now the costume's ONLY residual (no
   costume-HUE ranking for the second blind round — D2 stays closed); interior's re-read
   ("evenly lit lavender storeroom… pools of warm torchlight falling into deep violet
   darkness") is the follow-up to §303's shipped pool — the mechanism is live, the ambient
   hierarchy swamps it: LIGHTING, interior ambient/darkness pass.
2. **"Sly is off-model where identity lives"** — mask reads as nose blotch, ears sideways,
   ratio 5.72 vs the 4.5–5.5 gate, cane hook matte cream and small, fur zones flat, tail
   rings only from one yaw. → **CHARACTER**, with two routing carve-outs: (a) mask paint +
   ear placement are the dlrig HEAD SCULPT — **owner-waived (§294(1))**, not re-queued;
   (b) cane SHAPE is owner-locked (§294(2) "do not alter the shape") — but the critic's
   material ask (gold read: hard stepped spec + bloom kiss + dark occlusion) is NOT shape
   and is queued as the cheapest identity win; tail rings from all yaws → TEXTURES;
   perch slump pose → ANIMATION (#17, explicitly not waived).
3. **"The POSTFX artifact family"** — edge-detect christmas-lights on block seams (dunes/
   night/guard), ink on transparent FX (combat's porcelain-rimmed trail), bloom/bokeh ghost
   discs floating in temple (magenta)/sly-profile (120 px orange)/interior/night.
   → **POSTFX + FX**. The ghost discs are §298 item 2's sandHigh discs — attribution is
   already EVIDENCE-GRADE (temple +19.9 reproduced cross-boot); the FIX seal is now due.
   Edge-detect exclusion for FX quads + seam-glint gating join it.

Plus (verbatim): **"the §1 triangle budget is broken in 15 of 16 shots (up to 2.1×) and the
draw-call cap in 7"** → ARCHITECTURE/PROPS/TERRAIN mass arbitration, to the lead (standing
queue item, now with per-shot numbers). And the live-clock `setShot` warning → the critic
capture harness is aesthetic-only by design; every sealed A/B runs {dt:0} runners, so no
verdict in the records is exposed — noted, no action beyond this sentence.

## What the round confirms shipped well (one sentence each, per the brief's economy)

kaykit's raking sun is "the set's best lighting statement"; temple is "genuinely
competitive"; night is "the set's most convincing mood, closest to the license"; traversal's
"swing energy… genuinely good"; courtyard shows "real Sly grammar"; sly-profile's tail
"genuinely matches the reference — proves the team can hit the reference when a part is
actually authored"; sly-key's shirt is "the best banding evidence in the set"; and no shot
anywhere ranks costume hue.

## Comparison to r10 and the honest read

avg 4.44 vs 4.9 on a larger, harder set (guard/combat/kaykit staging shots are new lows the
r10 set never photographed). Like-for-like: interior 4.5 → 4 (the pool shipped into an
ambient that flattens it), temple stays the ceiling. The r10 headline defects (costume hue,
torches-cast-nothing as a mechanism, subject self-bloom) are gone or transformed into their
successor asks; the round's cost centers are now concentrated in the grade/exposure family
and two shots (guard, combat) whose subjects are FX that have never had a dedicated pass.

## Queue out of this round (priority order)

1. LIGHTING grade/exposure seal family: red-key saturation clamp (perch/arm/combat), hero
   22° raking key, interior ambient hierarchy (§303 follow-up), night shadow floor.
2. POSTFX/FX artifact seal family: sandHigh ghost-disc fix (§298 item 2, attribution done),
   FX-exclusion from edge-detect + seam-glint gating, guard cone rebuild (real volumetric
   cone), combat trail re-author.
3. CHARACTER material pass: gold cane read (material only, shape locked §294), tail ring
   texture from all yaws, lit-band saturation hold (SHADING, §277).
4. Budget arbitration with the critic's per-shot numbers. 5. #17 perch pose. 6. Option-A
   staging question to the owner (perch/arm framings cannot be fixed by any lighting seal).

> **CORRECTION (2026-08-14, §310):** the §1 budget breach reported in this round is FALSE. The
> manifest's `drawCalls`/`triangles` are `renderer.info.render` with `autoReset=false` — an
> all-passes submission counter (3 shadow cascades + beauty + normal prepass + blits). §1 caps
> VISIBLE geometry. Measured offline (`tools/budgetattrib.mjs`, reproduced by the coordinator):
> worst shot 85 draws (34% of 250) and 0.647M tris (54% of 1.2M); the whole level is 0.647M with
> culling off, so the reported 2.1x was arithmetically impossible. The critic brief that caused it
> is fixed at source (09808c1). No mass arbitration is owed to ARCHITECTURE/PROPS/TERRAIN.

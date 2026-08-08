# Critic pass 7 — RESULT

**REJECT, 2.5 / 10.** Floor is 8. **13 of 13 scored frames lose their blind side-by-side.**

Run against `BRIEF-critic7.md`, sealed 2026-08-03. Provenance in `PROVENANCE-critic7.md`; the critic
verified it independently rather than taking it on trust, including re-running
`git diff --stat 0737a35 a6aebe1 -- src/` (empty) and confirming the newest `src/` mtime predates the
capture window by 67 minutes.

## The verdict on the number

Pass 5 was 2.88, pass 6 was 2.1, this is 2.5. **The critic explicitly refused to let that be read as
progress:**

> The difference between 2.1 and 2.5 is inside the noise of a subjective instrument, and if the
> owners read it as "we moved the needle 0.4" they have mis-read it. The correct summary is: the
> frames are in the same band as pass 6, and the single disqualifying fact is unchanged — a game
> whose entire stated target is three cel-shaded franchises has no cel ramp in it anywhere.

## Scores

| startle | temple | courtyard | interior | traversal | dunes | key | closeup | combat | hero | profile | night | guard |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 4.0 | 3.5 | 3.5 | 3.5 | 3.0 | 2.5 | 2.5 | 2.0 | 2.0 | 2.0 | 1.5 | 1.5 | 1.5 |

`kaykit`, `sly-perch` and `sly-arm` were consulted as corroborating evidence and excluded from the
aggregate, per the roster.

## §1 — THERE IS NO TOON RAMP, ANYWHERE

The finding that subsumes most of the others, and the one this project has least excuse for.

**Flat-colour area** — share of pixels whose whole 5×5 neighbourhood spans ≤ 2 luma units, i.e. the
structural signature of cel art:

```
hero 0.2  kaykit 0.0  temple 0.3  closeup 0.9  startle 1.2  courtyard 0.1  dunes 0.1
interior 0.7  night 13.4  traversal 0.2  combat 0.4  guard 7.1  profile 1.4  key 0.8   (%)
```

Eleven of thirteen sit at **0.0–1.4 %**. 8–21 % of every frame is a colour no other pixel in that
frame shares. `night` and `guard` are not exceptions that prove flat art — they are crushed black
(55.8 % and 37.6 % of pixels below V = 0.20).

**Terminator hardness** on six ROIs, each on a single curved lit surface, each verified by mean RGB.
FLAT fraction is the share of adjacent pixel pairs with |ΔL| < 1; a quantised ramp gives **> 85 %**:

| ROI | FLAT frac |
|---|---|
| Sly shirt, chest | 28.9 % |
| Sly thigh | 25.4 % |
| Temple column | 12.4 % |
| Interior pillar | 32.2 % |
| Courtyard step | 28.0 % |
| Guard body | 50.6 % (only because half the ROI is crushed black) |

The |ΔL| distribution is **unimodal around 1–3, not bimodal**. This is not a near miss; it is a
different rendering philosophy from the one the project claims.

**This partially contradicts `toon.glsl.js`'s own defence.** That file argues `slyRamp` is correct
and merely has nothing to band, because "a flat face has one normal, lands wholly inside one band".
The critic's ROIs are on **curved** surfaces — a shirt over a chest, a column, a pillar — exactly
where a normal does turn, and the ramp still does not step. The geometry excuse does not cover the
measurement.

## §2 — a screen-space grain sits on everything, including the hero's face

Measured on `kaykit`'s single continuous floor plane: autocorrelation period **8 px near and 10 px
far** — depth-invariant, therefore screen-space. Amplitude on Sly's muzzle **7.28**, *higher than the
floor behind him* (6.62) and the wall (4.38); on his thigh **11.97**.

`PostFX.js:622` declares `grain: 0.016` as "static dither; the only thing keeping the sky gradient
off bands". Two problems with that defence: an 8–10 px correlation period is a **noise texture
sampled at screen scale**, not a per-pixel dither; and it is not doing the job it claims — the
critic measured `night`'s sky at **18 distinct luma levels over 250 rows, 77 of 249 adjacent-row
deltas exactly zero**, i.e. visibly banded and undithered anyway.

> "The team cannot judge their own shader while it is on."

That is the sharpest sentence in the pass. The grain confounded the critic's own faceting
measurement on the shirt, which means it has been confounding every visual judgement made in this
project, including all six previous critic passes.

## §3 — ink weight varies 20× and tracks asset provenance, not intent

Boundary darkening, median, sampled across many scanlines per object:

```
KayKit pot      130.2      Sly torso   30.1      guard NPC        6.4
vase prop        51.9      Sly tail    23.5      distant ziggurat 2.6
```

Inside single frames. The imported props out-ink the protagonist by 4×, and the guard NPC and every
distant silhouette have effectively **no outline at all** — which is why `traversal`'s and `dunes`'
skylines render as raw aliased staircases.

## The ranked defect list

1. **No toon ramp** — replace smooth Lambert with a 3-band step, hard transitions at NdotL ≈ 0.25
   and 0.62, smoothstep width ≈ 0.02 for AA only, same bands on character and world.
2. **Delete the screen-space grain pass.** Bake grain into albedo in UV space if wanted; exclude
   character materials entirely.
3. **One ink system** — inverted hull on skinned meshes at world-constant width, strip props' baked
   ink, remove the distance falloff.
4. **Rebuild the tail** — ≥12 straight silhouette segments with visible corner vertices at 443 px,
   zero ring banding, a stray spike, and an ink line that goes *dashed*. Needs 5–6 hard albedo ring
   bands and 6–8 subdivision rings.
5. **The cane is not held** — four identical parallel prongs, no thumb, shaft passing behind the
   fingers with a visible gap, confirmed across five framings. Grip must be IK-constrained to a
   socket on the cane.
6. **The cane hook is a mitred polyline** of three straight segments — a bent coat hanger, not a crook.
7. **No contact shadow or AO under anything** — measured non-monotonic with distance from the feet.
8. **Tonal range compressed at both ends** — p1 luma 20–25, p99 176–195, and 0.0–1.2 % of pixels
   above V = 0.90 in all thirteen. Nothing is black; nothing is white.
9. **God-rays are a Gaussian screen overlay** — 18 px 10–90 % edge transition, washing ~40 % of
   `temple` toward white and taking the columns' albedo with it.
10. **Combat FX veil the character** — a ~50 px additive band at peak luma 195 against a surround of
    70; Sly becomes a flat pink cutout with no blue, cap or tail bands.
11. **The guard NPC, and missing vision cones** — no ink, chrome fresnel, visible gaps at elbow and
    knee, and **no cone, alert state or detection indicator in either shot the roster says can carry
    them**, in a stealth game.
12. **Night has no structure** — 55.8 % below V = 0.20, a moon that lights nothing, and a
    full-strength fresnel drawing a cyan-white line on every polygon edge in the scene.

## Requirement 7 — what nobody had built a number for

Six of the twelve above. Beyond them, the critic names five areas with no instrument at all:
**style fracture by asset provenance** (the imported props are visibly from a different game than
the world they sit in); **composition** (`hero` gives its subject 133 px, off-centre, behind a dead
grey column, with 45 % of the canvas on an empty walkway and no rim light or value contrast at the
silhouette); **motion language** (`traversal` is the motion shot and has no trail, lag, anticipation
or camera roll); **posture and gesture** (Sly is bolt upright in every framing; his read is a low
forward prowl, and the existing spine rig measures geometry rather than gesture); and **unmotivated
screen elements** (a 15,086-px warm blob on a wall with no source, mid-air star sparkles, lens-flare
ghosts inside a windowless interior, dark ellipses in the sky).

It also flags a roster gap worth fixing before pass 8: **eyes-as-decals can only be seen in
`sly-startle`**, and no second scored frame can corroborate it. One more frontal close-up at a
different focal length closes that hole.

## What this means for today's work

The palette decision, the 36 placed props and the glove flexion were all real, measured
improvements, and **none of them touched any of the top three defects.** Two of the three —
the missing ramp and the grain — are single renderer changes that would move every score in the
table. That is where pass 8's work goes.

# PREREG-drift1 — attribution of §111's global cool drift

Written **before any arm frame exists**. Sweep `sweep2.mjs` was queued at 13:14; nothing in
`frames/` at the time of writing. Everything below comes from archived captures + source
arithmetic, both of which cost no lock.

## What is already established, at zero lock cost

**1. The instrument reproduces §111 exactly.** `tools/bmr.mjs` on the archived frames gives
`tx7/hero` 0.2721 / −0.0292 and `char12/hero` 0.2956 / +0.0119 — §111's published pair to four
decimals. `shots/tx7/report.json` confirms sha `7dc4442`, `dirty:false`.

**2. Extra reference points §111 quotes only as "0.04 to 0.10":**

| shot | tx7 (7dc4442) | today (arris2-off2, ad1b3a5) | Δ b−r | Δ luma |
|---|---|---|---|---|
| hero | 0.2721 / −0.0292 | 0.2957 / +0.0121 | **+0.0413** | +0.0236 |
| temple | 0.3314 / −0.0456 | 0.3055 / +0.0526 | **+0.0982** | −0.0259 |
| interior | 0.2357 / +0.0162 | 0.2366 / +0.0748 | **+0.0586** | +0.0009 |
| sly-closeup | 0.2592 / −0.0283 (eye1) | 0.2588 / +0.0529 (char14-ship) | **+0.0812** | −0.0004 |

**3. It is a STEP, not a drift.** Ordering every archived capture by its `report.json` commit
date, `hero` b−r is −0.0292 / −0.0292 / −0.0292 / −0.0298 across `tx7`, `cap2`, `eye1`, `char10`
and then **+0.0119** at `char12`. `sly-closeup` steps in the same gap: −0.0283 (`eye1`) →
+0.0503 (`char12`). Bracket: **`4b58fee` (char10) .. `52d4a43` (char12)**, 195 commits, and all
three suspect knobs (`07fe98c` bounceMix+shadowTeal, `bdf4ed1` scaffolding, `3b40036`
fillSkyMix 0.70) landed inside it. No capture exists between them — the container rollback
(§83/§91) left a 37-hour gap — so archived frames cannot narrow it further.

**4. THE DRIFT IS LUMINANCE-NEUTRAL, and this is the load-bearing observation.** The luma column
above does not move together: hero +0.0236, interior +0.0009, temple −0.0259, sly-closeup
−0.0004. On `sly-closeup` b−r swings +0.0812 while luma moves **+0.0004**. No single global
brightening or exposure term can produce that. A **luminance-matched hue rotation** can, and
both prime suspects are luma-matched *by construction*:
- `fillSkyMix` — "Luma-matched so the blend cannot change how bright the fill is, only what
  colour it is" (toon.glsl.js).
- `_refreshShadowColor` — the bounce mix is normalised to the tint's luminance, and the teal
  blend "lerps two equal-luminance colours [so it] cannot move night's brightness".

## Offline arithmetic (calc.mjs), scene-linear, sandstone `#c9915a`

Shadow LIGHT: tx7 `(0.142, 0.189, 0.423)` R/G 0.75 → HEAD `(0.080, 0.262, 0.415)` R/G **0.31**.
Red is cut 44% and green raised 39%. Ambient-side composite on a fully shadowed surface,
Δ(b−r) vs HEAD: `fill0` −0.0367, `sbm20` −0.0389, `teal0` −0.0024, `rim205` 0.000.

## Predictions — falsifiable, scored against the sweep

- **P1** `bloom155` and `rim205` each move frame b−r by **< 0.005** on hero. Both are
  luminance-changing terms and finding #4 says the defect is not one. *If either moves b−r by
  more than 0.01, finding #4 is wrong and this whole reading collapses.*
- **P2** `fill0` and `sbm20` each close **30–60 %** of hero's +0.0413, and `fill0sbm20` closes
  more than either alone.
- **P3** `tx7all` lands within **±0.010** of tx7's own −0.0292 on hero and −0.0456 on temple.
  Failing this does **not** exonerate the knobs — it means something outside `src/render`
  (world/textures/player, all present in every arm) also contributes, and the residual sizes it.
- **P4** `teal0` moves b−r **< 0.008** but is the one arm that visibly *darkens* shadows
  (shadow light luminance 12.5 % → 10.5 % of key).
- **P5** `base2` is bit-identical to `base`. If not, every number here is void.

## What would make me wrong in a way I would not otherwise notice

The archived "today" frames are `arris2-*`, captured by another agent for a texture A/B. If
their arm state leaked into the shipped frames, the "today" column is not the shipped state.
Guard: `char12` (clean, sha 52d4a43) and `char13` agree with `arris2-off2` to 0.0009 on hero,
and they are plain `shot.mjs` captures from a different agent on a different day. Three
independent sources, same number.

## Acceptance for any fix that follows (pre-registered, not negotiable after the fact)

The task-#16/#19 package these knobs belong to was accepted on **shadowed-architecture hue
angle** (≤226°) and **rim silhouette cost**, and on nothing else. Any correction I propose must
therefore be scored on **both** the old acceptance and the new one, or it is the same mistake
in the other direction:
1. frame b−r moves materially back toward tx7 on hero **and** temple **and** sly-closeup;
2. shadowed-architecture hue stays ≤226° with saturation not collapsing (§2.2 forbids grey);
3. `night` is re-measured — §112.3 already shows night is where the cool terms pay for
   themselves, and the last two shadow-hue changes were both required to measure it;
4. the frames are looked at side by side, because §3 records this exact defect producing
   on-target numbers over a plainly wrong image twice.

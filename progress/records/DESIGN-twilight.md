# DESIGN-twilight — fixing the tod-0.80 monochrome: two candidate directions, one decision needed

Follow-up to RESULT-redflood / §293 (the "blown red wall" on `sly-perch`/`sly-arm`/`combat` is
the twilight light ENVIRONMENT — every anchor leg warm by authored design — not the grade,
haze, or saturation; grade knobs recover ~⅓ at best). This is a design memo, not a seal: it
frames the choice so the fix seal can be written cleanly once a direction is picked.

## Option A — re-stage the affected shots (tod 0.80 → ~0.74–0.76)

Move the three stagings back above the sunset knee, where the 22° golden anchor holds §2.2's
triplet and lit/shadow separation exists by construction.

- FOR: zero render changes; daylight shots untouched by definition; the golden anchor is the
  bible ("these numbers decide whether the game looks like Sly Cooper").
- AGAINST: those stagings were sealed choices (Shots.js carries their derivations); "fix the
  shot by avoiding the condition" leaves twilight itself broken for gameplay at that clock —
  the player WILL stand in tod 0.80 light.

## Option B — cool the ≤2° anchors' fill leg (hemiSky/fog separation at twilight)

Give the el ≤ 2° anchors a cooler hemiSky/violet-shadow leg so shaded surfaces diverge from
key-lit ones even at twilight — the BotW Gerudo-dusk device the critic's own dunes note asks
for (violet slip-face shadow against warm light).

- FOR: fixes the CONDITION, not just three framings; aligns with the critic's reference
  physics; the anchor table is already elevation-keyed, so the change is scoped by
  construction (22°+ anchors untouched → daylight bit-identical, verifiable by frame diff).
- AGAINST: it is an art-direction change to authored anchors ("touch them last" is written on
  the 22° anchor, and the twilight anchors carry the same authorship weight); needs a
  hue-DISPERSION statistic (mean saturation was the wrong lens, proven) and fresh bars.

## Recommendation and the flag

**B, with A's tod question deferred**: B addresses the mechanism the measurements convict, is
elevation-scoped so the protected set is provable, and pays off in every twilight frame. The
seal would register: a hue-dispersion statistic over the registered WALL ROIs (circular hue
std or bimodality, not mean-S), daylight-protection diffs on ≥3 golden-anchor shots
(bit-identical or ≤ registered floor), and a LOOK gate. **Owner-taste flag stands**: cooling
twilight shadows changes the game's dusk look — the owner may prefer the hot monochrome dusk
as a style. Routed for the next planning pass; no constant moves under this memo.
